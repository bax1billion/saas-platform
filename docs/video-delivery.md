# Video delivery & large-file upload — reference stack and implementation plan

**Status:** planned · **Last revised:** 2026-09-13
**Companion to:** the private media CDN in `amplify/custom/media-cdn/`
(image variants) and the `s3-file-trigger` ingest stub.

Verticals that store user-captured media — photos, phone/drone video,
body-worn camera clips, audio — need three things the foundation does not
yet provide: web-playable video, resilient large-file upload from the
field, and an evidence-grade integrity record for originals. This doc
answers, with sources:

1. What the foundation actually provides today for upload and delivery.
2. Whether video needs its own CDN behavior and an AWS Elemental
   MediaConvert pipeline, and the AWS-recommended shape.
3. Whether uploads should use S3 Transfer Acceleration or CloudFront as an
   edge upload path.

Everything marked **[confirmed]** is from an AWS doc or blog cited in §9;
**[inference]** is our reading of those facts against this codebase.

---

## 1. What the foundation provides today

### 1.1 Upload path

Verticals upload with Amplify Storage `uploadData()` (`aws-amplify`
^6.16.2 / `@aws-amplify/storage` 6.13.x) straight from the browser to the
`appFiles` bucket under `uploads/{entityId}/…`. What the installed client
does (read from `node_modules/@aws-amplify/storage/dist/esm/providers/s3`):

| Behavior | Today |
|---|---|
| Multipart | Automatic above **5 MiB**; **5 MiB parts**, **4 parts in flight** (`DEFAULT_PART_SIZE`, `DEFAULT_QUEUE_SIZE`). Not configurable from the call site. |
| Pause / resume / cancel | Available on the returned task (`pause()`, `resume()`, `cancel()`); nothing in the foundation exposes them. |
| Resume across a page reload | The client keeps a multipart cache keyed by file name/size/type/bucket/key (`uploadCache.mjs`) so re-selecting the same file can `ListParts` and continue. Gen 1 docs promise this; Gen 2 docs don't restate it — **unverified for v6, test it** (§7 P0). |
| Transfer Acceleration | Off. `useAccelerateEndpoint` is not set and the bucket has no `accelerateConfiguration`. |
| Integrity | None. `checksumAlgorithm` unset; the client only supports `'crc-32'` anyway. No SHA-256 client- or server-side. |
| Retry | Only what the SDK does per request. |

`amplify/functions/s3-file-trigger/handler.ts` fires on every `uploads/`
object but is a **stub**: type/size validation, SHA-256 streaming, and the
record update are all `TODO`. The foundation `FileValidationStatus` enum
exists for the record but is never written.

### 1.2 Delivery path

Images are done: CloudFront → viewer-request function → transformed
bucket → sharp Lambda fallback, private via one wildcard custom-policy
**signed URL per key prefix** from the `getMediaAccess` query
(`amplify/functions/get-media-urls/`, 15-minute TTL).

Video and audio are **not deliverable through the CDN**:

- The distribution's only origin fallback is the sharp Lambda, which
  **buffers the whole object and 413s above 30 MB** (`MAX_ORIGINAL_BYTES`)
  and answers through a Function URL with a 302-to-S3 detour for anything
  over 5 MB. It is an image origin; it cannot stream a range request for a
  2 GB clip.
- There is no derivatives location for video and nothing produces posters,
  durations, or web-playable renditions.

So: **uploads work (unaccelerated, unverified, unhashed); image delivery
works; video delivery does not exist yet.**

---

## 2. Do we need a video pipeline? Yes — the AWS "VOD Foundation" shape

Serving originals is not a viable baseline for phone and drone sources
**[inference from confirmed facts]**:

- iPhone `.mov` is **HEVC**, often 10-bit HLG (Dolby Vision profile 8.4).
  Safari plays it; Chrome only where hardware decode exists; Firefox
  generally not. Desktop reviewers would get a broken player.
- Drone 4K clips at 60–100 Mbps stall on cellular without an ABR ladder.
- Evidence-grade originals must stay byte-identical and hash-verified, so
  any normalization has to be a **derivative with lineage**, exactly as
  image variants are.

CloudFront + S3 does satisfy the mechanics — CloudFront serves and caches
**range GETs**, S3 supports them, and Apple requires byte-range support
for iOS playback **[confirmed]** — so a plain H.264 MP4 behind the CDN is
a legitimate *fallback* for already-compatible sources. It is not the plan.

### 2.1 Recommended architecture

```
vertical UI / native app
   │ uploadData(useAccelerateEndpoint) + x-amz-meta-media-id
   ▼
appFiles bucket  uploads/{entityId}/{uuid}-{name}        ← original, immutable, hashed at ingest
   │ S3 event (existing AwsCustomResource notification, backend.ts #4)
   ▼
s3-file-trigger Lambda (grows into the ingest pipeline)
   ├─ HEAD → allowlist type/size · stream SHA-256 → <media record>.sha256
   ├─ image → (HEIC→JPEG decision, see media-cdn header comments)
   └─ video → MediaConvert CreateJob (template: poster + H.264 MP4 [+ HLS ladder])
          userMetadata { mediaId, entityId }
   ▼
MediaConvert ──► media-derivatives bucket
                 uploads/{entityId}/{uuid}-{name}/video/poster.0000000.jpg
                 uploads/{entityId}/{uuid}-{name}/video/720p.mp4
                 uploads/{entityId}/{uuid}-{name}/video/hls/master.m3u8 + segments
   │ EventBridge: MediaConvert Job State Change → COMPLETE | ERROR
   ▼
media-convert-complete Lambda → AppSync (IAM): derivativeStatus, posterKey,
                                playbackKey, durationMs, width/height
   ▼
Media CDN distribution (existing) — NEW behavior `uploads/*/video/*` →
  S3 origin (OAC) on the derivatives bucket, no Lambda fallback,
  GET/HEAD/OPTIONS, CachingOptimized, same key group (signed)
```

This is the `aws-solutions-library-samples/video-on-demand-on-aws-foundation`
pattern — S3 → `job_submit` Lambda → MediaConvert → S3 → CloudFront, with a
`job_complete` Lambda on EventBridge **[confirmed]**. Both VOD solutions
were moved from `aws-solutions` to `aws-solutions-library-samples` and
rebranded "Guidance" in March 2026; releases since are dependency bumps
**[confirmed]** — maintained, not evolving. We copy the two-Lambda shape
into Amplify Gen 2 rather than deploying the stack (it brings its own
CloudFront and buckets and, in the full VOD variant, Step Functions/SQS/SNS
we don't need) **[inference]**.

### 2.2 Why derivatives live under the same key namespace

`getMediaAccess` signs one wildcard custom policy per prefix
(`https://<domain>/uploads/<entityId>/*`). Keeping derivatives at
`uploads/<entityId>/<original>/video/…` — in a **different bucket**, routed
by a CloudFront path pattern — means the **existing grant already covers
posters, MP4 and HLS segments**. No second grant, no multi-resource
policy, and the viewer function's prefix whitelist is unchanged. The image
transform path (`/<key>/<variant>`) and the video path
(`/<key>/video/<file>`) can't collide because `video/` is not a valid image
variant segment.

### 2.3 Playback contract, by phase

| Phase | What plays | Auth | Works where |
|---|---|---|---|
| **V1** | Poster + one **H.264 MP4 (720p, ≤ ~4 Mbps)** derivative, progressive, range-served from S3 via CloudFront | Existing **signed URL** (one file) | Every environment, including sandboxes on the `*.cloudfront.net` domain; every browser |
| **V2** | HLS ladder (1080p/720p/480p, CMAF) via hls.js / native Safari | **Signed cookies** (`Domain=.<product-domain>`) — AWS's recommendation for "all the files for a video in HLS format" **[confirmed]** | Needs a per-environment custom media domain so app and CDN share a parent domain |
| Always | **Original** download | Signed URL to `/original`, but **served by a direct S3 origin behavior**, not the sharp Lambda | Needs a `uploads/*` behavior ordering fix (§7 P1) |

hls.js can append the signed query to every segment via `xhrSetup`, but
native Safari HLS cannot, so URL signing does not scale to HLS on iPhone —
hence cookies for V2 **[inference]**. Audio (`.m4a`, `.mp3`) plays natively
everywhere; serve the original through the direct S3 behavior, no
transcode.

### 2.4 MediaConvert job settings (the template to ship)

- **Input**: `Rotate: AUTO` on every job — phone `.mov`/`.mp4` carry
  rotation metadata; MediaConvert bakes the rotation into the pixels and
  strips the metadata, which is what web players need **[confirmed]**.
  HEVC in MOV/MP4 is a supported input; MOV must be self-contained
  **[confirmed]**.
- **HDR → SDR**: for iPhone HLG/Dolby Vision 8.4 sources, set the Color
  corrector to **Rec. 709** so the H.264 output is SDR; MediaConvert
  tone-maps and picks "Preserve details" for HLG automatically, and AWS
  says to review outputs **[confirmed]**. Profile 8.4 *ingest* is not
  documented explicitly — **test with real iPhone 12+ footage before
  relying on it [confirmed absence]**. Never *output* Dolby Vision (Pro
  tier, Main10, single-input constraints) **[confirmed]**.
- **Outputs**: File group / no container / **frame capture to JPEG** for the
  poster (only allowed alongside a regular A/V output) **[confirmed]**; File
  group MP4 H.264 720p QVBR for V1; **CMAF** group for the V2 ladder (AWS
  recommends CMAF when HEVC is involved; for H.264 it is still the
  broadest HLS form) **[confirmed]**.
- **Tier**: everything above is **Basic tier** (AVC single-pass); HEVC
  *input* does not require Pro **[confirmed]**.
- `userMetadata: { mediaId, entityId }` so the COMPLETE event maps back to
  the record without a lookup **[confirmed: the event carries
  userMetadata, outputFilePaths, playlistFilePaths, durationInMs,
  videoDetails]**.

Alternatives rejected: **Amazon IVS** is live-streaming; its VOD is
auto-record of live channels and it does not ingest files **[confirmed]**.
**Serve-originals-only**: see above. **Third-party video SaaS**: the same
data-posture objection as for images — regulated or evidentiary media
through a third-party processor is a compliance conversation, plus
per-asset pricing.

---

## 3. Uploads: Transfer Acceleration vs. CloudFront

### 3.1 The AWS answer

AWS's own comparison (blog, Feb 2026) **[confirmed]**:

| Path | AWS positioning |
|---|---|
| **S3 Transfer Acceleration (S3TA)** | "Large files (1 GB+)" over long distance. Bucket-level; routes through CloudFront edge locations onto the AWS backbone; endpoint `{bucket}.s3-accelerate.amazonaws.com`; **bucket name must contain no periods**; virtual-hosted style only. |
| **CloudFront PUT/POST (OAC)** | "Designed for smaller objects (<1 GB)" when CloudFront is already in the request flow. OAC does support PUT/DELETE to S3 (OAI did not); body limit 64 GB; auth is either CloudFront-signed (`always` — then anyone with the URL can write, so gate it) or pass-through of the viewer's SigV4 (`no-override`, `Authorization` must be in the cache policy). **Multipart through CloudFront is not addressed by AWS docs.** |
| Multi-Region Access Points | Multi-region only. |

Measured on AWS's reference sample (485 MB, 79 Mbps client)
**[confirmed]**: single PUT 72 s → +S3TA 43 s → multipart ×5 45 s →
**multipart + S3TA 28 s (−61%)**.

Pricing **[confirmed]**: S3TA **$0.04/GB** in via US/EU/JP edges
($0.08 elsewhere); AWS does not charge when acceleration would not have
been faster.

### 3.2 Decision

**Use S3 Transfer Acceleration, not CloudFront as an upload path.**

- It is two lines: `cfnBucket.accelerateConfiguration = { accelerationStatus: 'Enabled' }`
  on `backend.storage.resources.bucket` in `backend.ts` (Amplify documents
  exactly this) and `useAccelerateEndpoint: true` in the vertical's
  `uploadData` call **[confirmed]**. Amplify's declarative storage auth
  (`allow.authenticated` on `uploads/{entity_id}/*`) is untouched.
- Field uploads are multi-GB video files — the S3TA case, not the
  CloudFront-PUT case.
- Uploading through CloudFront would mean re-implementing auth in a
  CloudFront Function or a signed-PUT issuer, and losing multipart. That is
  the "inbound HTTP is not an escape hatch" argument from `docs/modules.md`
  applied to uploads.
- Precondition: confirm the Amplify-generated bucket name has **no dots**
  (Amplify's default `amplify-…-appfilesbucket…` pattern does not, but
  verify per environment before enabling).

### 3.3 Upload robustness (independent of acceleration)

A loss-proof upload path needs, in order:

1. **Verify cross-reload resume** with the installed client (drop a 300 MB
   file, kill the tab at 40 %, re-select the same file, watch for
   `ListParts`). If it does not resume, wrap our own
   CreateMultipartUpload/UploadPart/Complete in a Lambda-issued presigned
   flow with 8–16 MiB parts, 4–6 in flight, exponential backoff, and
   persist `uploadId` + part ETags in IndexedDB — AWS's sample does this
   **[confirmed]**.
2. **Parallel files with a visible queue** (per-file progress, retry,
   pause), and no modal that can discard an unsynced item.
3. **Object metadata**: `x-amz-meta-media-id` on upload so the S3 trigger
   can update the right record without a GSI on the S3 key.
4. **Size/type policy** enforced client-side *and* in the trigger
   (allowlist by content type; cap per class).

A native companion app using `uploadData` from `aws-amplify/storage`
inherits the same call and gains `useAccelerateEndpoint` for free.

---

## 4. Integrity: where SHA-256 actually gets computed

S3's checksum features constrain how originals get hash-verified
**[confirmed]**:

- S3 verifies **SHA-256 server-side on a single-part PUT** (≤ 5 GB) when the
  client sends `x-amz-checksum-sha256`.
- For **multipart, full-object checksums are CRC-only**; SHA-256 is stored
  as a *composite* (hash of part hashes), and only if
  `x-amz-checksum-algorithm: SHA256` was set at CreateMultipartUpload.
  Since Dec 2024 every SDK upload carries a full-object CRC64NVME by
  default, so byte-stream integrity is already verified — just not as
  SHA-256.
- Amplify `uploadData` can only send **CRC32**.

Decision **[inference]**: the **evidence hash is computed at ingest** by
the `s3-file-trigger` streaming the stored object (a 5 GB object at
~100 MB/s is under a minute; raise the function timeout from 120 s toward
the 15-min limit and stream, never buffer) and written to the record's
`sha256`. A native app can additionally hash at capture and store its hash
on the record; the trigger compares and flags a mismatch. Client-side
SHA-256 in the browser is optional polish, not the source of truth. Later
audits use `GetObjectAttributes` / S3 Batch "Compute checksum"
**[confirmed]**.

**Immutability**: enable **Versioning + S3 Object Lock** (Governance mode,
retention aligned to the tenant's policy; legal hold for litigation) on the
originals bucket before it holds production data — that is the
evidence-grade control **[confirmed]**, and Object Lock cannot be enabled
retroactively without a new bucket.

---

## 5. Data model deltas (vertical media model)

On the vertical's file-bearing model (server-written columns → field-level
rules, read for all groups, write for nobody — `core-data-model.md` §2.5;
the trigger and the job-complete Lambda write over IAM):

| Column | Type | Written by |
|---|---|---|
| `sha256` | string | ingest trigger |
| `fileValidationStatus` | `FileValidationStatus` (foundation enum) | ingest trigger |
| `derivativeStatus` | enum `NONE / QUEUED / READY / FAILED` | trigger (QUEUED) / job-complete |
| `posterKey`, `playbackKey`, `hlsKey` | string | job-complete |
| `durationMs`, `width`, `height` | int | job-complete (`durationInMs`, `videoDetails`) |
| `mediaConvertJobId` | string | trigger |

No new tables; nothing streams differently. The foundation contributes
the pipeline and the column *conventions*; each vertical adds the columns
to its own model.

---

## 6. Costs (order of magnitude)

MediaConvert bills per **output minute**, Basic tier for AVC
**[confirmed]**: AVC HD ≤30 fps **$0.015/min**, SD $0.0075/min; frame
captures are not separately priced.

| Workload | Approx. |
|---|---|
| V1: poster + one 720p H.264 MP4, per hour of source | **~$0.90** |
| V2: 1080p + 720p + 480p ladder, per hour of source | **~$2.25** (multi-pass QVBR costs more) |
| A small tenant, ~5 hours of video/month | $5–12/month transcode; derivative storage a few GB; CloudFront egress dominates, as with images |
| S3TA | $0.04/GB uploaded; a 2 GB clip ≈ $0.08 |

The always-on cost is zero: no Fargate, no MediaPackage, no IVS channel.

---

## 7. Implementation plan

**P0 — now, no infra:**

- Verify `uploadData` cross-reload resume and document the result here.
- Verticals: expose upload queue/progress/retry; upload files in parallel
  (bounded); never block the tab on an in-flight upload.
- Enable **S3TA** (bucket + `useAccelerateEndpoint`) after confirming the
  bucket name; measure with AWS's speed-comparison tool from a phone on
  LTE.

**P1 — direct original delivery + ingest hash:**

- Add a **direct S3-origin behavior** on the media distribution for
  `uploads/*/original` (GET/HEAD, range-friendly, no Lambda) so video and
  audio originals stream through the CDN under the existing signed grant;
  keep the sharp path for image variants.
- Fill in `s3-file-trigger`: HEAD, allowlist, streamed SHA-256, record
  update via AppSync using `x-amz-meta-media-id`. The record type to update
  comes from a vertical seam (which model owns `uploads/<prefix>`), not a
  hardcoded name.
- Versioning + Object Lock decision on the originals bucket.

**P2 — MediaConvert V1 (poster + 720p MP4):**

- `amplify/custom/media-pipeline/`: derivatives bucket (OAC-only,
  regenerable, **no short lifecycle** — ~$1/hr to regenerate), MediaConvert
  service role (trust `mediaconvert.amazonaws.com`, read originals, write
  derivatives, KMS if applicable **[confirmed]**), job template JSON
  (`Rotate: AUTO`, Rec. 709 color conversion, frame capture + 720p AVC
  QVBR), EventBridge rule on `MediaConvert Job State Change` for
  `COMPLETE`/`ERROR` → `media-convert-complete` Lambda **[confirmed event
  shape]**. Submit from the ingest trigger (`mediaconvert:CreateJob`,
  `DescribeEndpoints`, `iam:PassRole`).
- New CDN behavior `uploads/*/video/*` → derivatives bucket, same key
  group. Posters are JPEGs in the *derivatives* bucket, so the transform
  Lambda needs read on it too if verticals want poster variants.
- Golden fixtures: one iPhone HEVC/HLG `.mov`, one 4K drone `.mp4`, one
  body-worn-camera `.mp4`, one portrait phone clip (rotation).

**P3 — HLS V2 (when a tenant needs cellular playback):**

- CMAF ladder output group in the same job; `hlsKey` on the record.
- Custom media domain per environment + **signed cookies** issued by
  `getMediaAccess` alongside the URL params (cookie `Domain` = parent of
  app and media hosts); hls.js on non-Safari, native `<video src=m3u8>`
  on Safari.
- Decide whether any access class must bypass edge caching entirely
  (`no-store` for the most restricted prefixes).

**Explicitly not doing:** redaction/blur derivatives (a lineage workflow
owned by the vertical), live streaming, transcription (a separate
Transcribe job off the same original), and any transformation of exports.

---

## 8. Open questions

1. Poster frame choice: first frame (default) vs. a mid-clip capture —
   first frames of body-worn footage are often black.
2. Transcode already-H.264 `.mp4` sources at all, or serve the original and
   only make a poster? Deterministic-always-transcode is simpler and
   ~$0.90/hr; decide after the golden fixtures.
3. Derivative retention: keep forever with the record, or regenerate on
   demand after N years (cost vs. reproducibility).
4. Object Lock mode and retention period per tenant policy — must be
   settled before production buckets hold data.
5. Whether a native app should hash at capture *and* upload with
   `x-amz-checksum-sha256` on single-part PUTs (files ≤ 5 GB) for a
   server-verified hash in addition to the ingest hash.
6. Signed cookies require the custom media domain; is that a P3
   prerequisite we accept, or do we rewrite playlist segment URIs in the
   job-complete Lambda to carry the prefix grant instead?

---

## 9. Sources

MediaConvert
- https://docs.aws.amazon.com/mediaconvert/latest/ug/auto-rotate.html · https://docs.aws.amazon.com/mediaconvert/latest/ug/auto-rotate-requirements.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/working-with-job-templates.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/file-group-with-frame-capture-output.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/reference-codecs-containers-input.html · https://docs.aws.amazon.com/mediaconvert/latest/ug/supported-containers-codecs-details.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/hdr.html · https://docs.aws.amazon.com/mediaconvert/latest/ug/converting-the-color-space.html · https://docs.aws.amazon.com/mediaconvert/latest/ug/dolby-vision-job-limitations-and-requirements.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/iam-role.html
- https://docs.aws.amazon.com/mediaconvert/latest/ug/mediaconvert_event_list.html · https://docs.aws.amazon.com/mediaconvert/latest/ug/ev_status_complete.html
- https://aws.amazon.com/mediaconvert/pricing/ · https://aws.amazon.com/mediaconvert/features/

Reference implementations
- https://github.com/aws-solutions-library-samples/video-on-demand-on-aws-foundation (S3 → job_submit → MediaConvert → job_complete → CloudFront; job settings under `source/job-submit/lib/`)
- https://github.com/aws-solutions-library-samples/video-on-demand-on-aws (full variant: Step Functions, DynamoDB, optional MediaPackage)
- https://github.com/aws-samples/amazon-s3-multipart-upload-transfer-acceleration · https://aws.amazon.com/blogs/compute/uploading-large-objects-to-amazon-s3-using-multipart-upload-and-transfer-acceleration/

CloudFront
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RangeGETs.html · https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html (OAC, PUT/DELETE, `always` vs `no-override`)
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html
- https://aws.amazon.com/blogs/networking-and-content-delivery/using-aws-edge-to-optimize-object-uploads-to-amazon-s3/ (S3TA vs CloudFront PUT vs MRAP, Feb 2026)

S3 uploads & integrity
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html · https://aws.amazon.com/s3/pricing/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html (multipart limits)
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html · https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html · https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-s3-default-data-integrity-protections
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

Amplify Gen 2
- https://docs.amplify.aws/react/build-a-backend/storage/upload-files/ (`uploadData`: multipart >5 MB, pause/resume, `useAccelerateEndpoint`, `checksumAlgorithm` crc-32 only)
- https://docs.amplify.aws/gen1/javascript/build-a-backend/storage/upload/ (Gen 1 resume-after-refresh statement)
- https://docs.amplify.aws/react/build-a-backend/storage/lambda-triggers/ · https://docs.amplify.aws/react/build-a-backend/storage/extend-s3-resources/ · https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/

Browser/playback
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html (byte-range requirement)
- https://webkit.org/blog/14735/webkit-features-in-safari-17-1/ (Managed Media Source)
- https://aws.amazon.com/ivs/faqs/ (IVS is live-only)
