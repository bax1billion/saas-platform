import type { S3Event } from 'aws-lambda';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import exifr from 'exifr';
import { graphql } from '../../shared/graphql';
import { recordMediaIngest } from '../../data/media-ingest';
import {
  EXIF_HEAD_BYTES,
  parseUploadKey,
  shortHash,
  validateUpload,
  type ExifSummary,
  type IngestResult,
} from './ingest';

/**
 * Ingest pipeline for objects landing under uploads/ (docs/video-delivery.md
 * §4; docs/getting-started.md "Storage").
 *
 *   S3 ObjectCreated → HEAD (type, size, `media-id` metadata)
 *     → allowlist + size policy (ingest.ts)
 *     → stream the object once: SHA-256 of every byte, EXIF from the head
 *     → amplify/data/media-ingest.ts writes the vertical's record over IAM
 *
 * Originals are never modified or moved; an INVALID decision is recorded
 * on the row, not enforced on the object. The vertical seam may answer
 * "retry" when the owning record does not exist yet (the client creates
 * it right after the upload completes) — the handler waits briefly, then
 * throws so Lambda's async retry (1 min, 2 min) finishes the job.
 *
 * Idempotent: re-running on the same object recomputes the same hash and
 * rewrites the same columns.
 */

const s3 = new S3Client({});

const RETRY_WAIT_MS = 2000;
const RETRY_ATTEMPTS = 3;

const EXIF_PICK = [
  'DateTimeOriginal',
  'CreateDate',
  'ExifImageWidth',
  'ExifImageHeight',
  'ImageWidth',
  'ImageHeight',
  'Make',
  'Model',
] as const;

/** Parse the EXIF we keep from the first bytes of an image. Best effort. */
export async function readExif(head: Buffer): Promise<ExifSummary> {
  try {
    const tags = (await exifr.parse(head, {
      pick: [...EXIF_PICK],
      gps: true,
      translateValues: true,
      reviveValues: true,
    })) as Record<string, unknown> | undefined;
    if (!tags) return {};
    const date = (tags.DateTimeOriginal ?? tags.CreateDate) as Date | string | undefined;
    const capturedAt =
      date instanceof Date && !Number.isNaN(date.getTime())
        ? date.toISOString()
        : typeof date === 'string' && !Number.isNaN(Date.parse(date))
          ? new Date(date).toISOString()
          : undefined;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);
    return {
      capturedAt,
      width: num(tags.ExifImageWidth) ?? num(tags.ImageWidth),
      height: num(tags.ExifImageHeight) ?? num(tags.ImageHeight),
      gpsLat: num(tags.latitude),
      gpsLng: num(tags.longitude),
      cameraMake: str(tags.Make),
      cameraModel: str(tags.Model),
    };
  } catch (err) {
    console.log('S3FileTrigger: EXIF not readable', { message: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

/** One pass over the object: full SHA-256 plus the first EXIF_HEAD_BYTES kept aside. */
async function hashObject(
  bucket: string,
  key: string,
  keepHead: boolean
): Promise<{ sha256: string; head: Buffer }> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = obj.Body as Readable;
  const hash = createHash('sha256');
  const headChunks: Buffer[] = [];
  let headBytes = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(buf);
    if (keepHead && headBytes < EXIF_HEAD_BYTES) {
      headChunks.push(buf);
      headBytes += buf.length;
    }
  }
  return { sha256: hash.digest('hex'), head: Buffer.concat(headChunks).subarray(0, EXIF_HEAD_BYTES) };
}

async function processObject(bucket: string, key: string): Promise<void> {
  const parsed = parseUploadKey(key);
  if (!parsed) {
    console.log('S3FileTrigger: skipping non-upload path', { key });
    return;
  }

  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const sizeBytes = head.ContentLength ?? 0;
  const mediaId = head.Metadata?.['media-id'];
  const decision = validateUpload({ contentType: head.ContentType, fileName: parsed.fileName, sizeBytes });

  let result: IngestResult;
  if (!decision.ok) {
    result = { status: 'INVALID', message: decision.message, contentType: head.ContentType, sizeBytes };
    console.log('S3FileTrigger: INVALID', { key, mediaId, message: decision.message });
  } else {
    const started = Date.now();
    const { sha256, head: headBytes } = await hashObject(bucket, key, decision.cls === 'image');
    const exif = decision.cls === 'image' ? await readExif(headBytes) : {};
    result = {
      status: 'VALID',
      cls: decision.cls,
      contentType: decision.contentType,
      sizeBytes,
      sha256,
      hashedAt: new Date().toISOString(),
      ...exif,
    };
    console.log('S3FileTrigger: VALID', {
      key,
      mediaId,
      cls: decision.cls,
      sizeBytes,
      sha256: shortHash(sha256),
      ms: Date.now() - started,
    });
  }

  for (let attempt = 1; ; attempt++) {
    const outcome = await recordMediaIngest({ bucket, key, entityId: parsed.entityId, mediaId, result, graphql });
    if (outcome !== 'retry') {
      console.log('S3FileTrigger: recorded', { key, mediaId, outcome });
      return;
    }
    if (attempt >= RETRY_ATTEMPTS) {
      // Let Lambda's async retry pick it up after the client has created the row.
      throw new Error(`S3FileTrigger: owning record not found yet for ${key} (media-id ${mediaId ?? 'none'})`);
    }
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
  }
}

export const handler = async (event: S3Event): Promise<void> => {
  const results = await Promise.allSettled(
    event.Records.map((record) =>
      processObject(record.s3.bucket.name, decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')))
    )
  );
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length > 0) {
    // Surface the first failure so the whole batch (one object per S3 event
    // in practice) is retried by Lambda.
    throw failed[0].reason instanceof Error ? failed[0].reason : new Error(String(failed[0].reason));
  }
};
