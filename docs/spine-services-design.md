# Shared services: notifications, Assist on Bedrock, document export

**Status:** design v1, 2026-10-04; Assist and export built 2026-10-05.
**Foundation doc.** "Spine" is the set of platform pieces every login gets
regardless of which modules an organization licenses; these three services
are the spine's shared infrastructure. Products plug in through seams and
never build their own.

| Service | State | Who waits on it |
|---|---|---|
| Notifications (email, text, later push and voice) | designed, not built | any module that sends outside the app |
| Assist on Bedrock | built, dark until an environment opts in | every suggest-and-confirm helper |
| Document export (PDF now, Word later) | built, not yet exercised on a sandbox | every branded report |

Conventions that bind all three: `docs/modules.md` (streams first, a
command only to reject before write), `docs/data-coupling.md` (one owning
module per table), `CLAUDE.md` (foundation code holds no product facts;
module Lambdas import `modules/` by relative path; secrets by name per
environment; nothing that only synth has seen counts as working).

---

## 1. Notifications

### 1.1 What exists

- **Email:** SES is referenced but nothing sends. `newsletter-subscriber-trigger`
  has two TODOs where the confirmation and welcome mails go.
  `SES_CONFIGURATION.md` is the console runbook (domain, DKIM, MAIL FROM,
  production access, configuration sets).
- **Receipts:** `amplify/backend.ts` creates an SNS topic
  (`SESNotificationTopic`) subscribed by `ses-webhook-handler`, which parses
  bounce, complaint and delivery notifications and logs them; the database
  write-back is a TODO. The topic ARN is a stack output to paste into SES.
- **Text and voice:** nothing. No SNS SMS origination identity, no telephony
  provider.
- **The seam a product should expose:** one `dispatch()` in the module
  that owns the delivery row, taking a channel (VOICE, SMS, PUSH, EMAIL,
  MANUAL), a purpose, a recipient and an attempt, and returning a failure
  reason or null. A `log` mode simulates on sandboxes and is refused on
  deployed branches, where every leg fails with `NO_PROVIDER_CONFIGURED`
  until adapters exist.

### 1.2 Design

One platform sender library behind the seam the modules already call; no
module gains a second way to send.

```
module Lambda
  └─ dispatch(channel, purpose, recipient, body)        module-owned seam, unchanged
       └─ amplify/shared/notify/                         foundation adapter library
            ├─ email.ts   SES v2 SendEmail (configuration set, tags)
            ├─ sms.ts     SNS Publish to a phone number (transactional)
            ├─ push.ts    later: SNS platform application or a push vendor
            ├─ voice.ts   later: a telephony vendor behind the same shape
            └─ index.ts   send(leg) -> { providerMessageId } | { failure }
  NOTIFY_MODE=log|live (platform-wide)
receipts
  SES configuration set event destination -> SESNotificationTopic (exists)
  SNS SMS delivery status -> CloudWatch log group (SNS feature)
  ses-webhook-handler marks the delivery row DELIVERED / BOUNCED / COMPLAINED
```

Decisions:

- **A library, not a Lambda.** The sender runs inside the module Lambda
  that already owns the delivery row, so there is no cross-Lambda IAM
  caller to invent (`CLAUDE.md` gotcha on system callers) and no network
  hop. A `grantNotify(fn)` helper in `amplify/backend.ts` attaches
  `ses:SendEmail`, `ses:SendRawEmail` and `sns:Publish` to each sending
  function, scoped to the configuration set and to phone-number publishes.
- **Provider-neutral rows.** The delivery row keeps `providerMessageId`,
  `state`, `failureReason`; receipts update it by message id through a
  `byProviderMessageId` GSI on each module's delivery table; when a core
  `NotificationDelivery` model lands, the module tables point at it instead.
- **Templates in code, not SES templates.** Subject and body are rendered
  by the module from its own copy with a shared header and footer from
  `amplify/shared/notify/layout.ts`. SES templates would split the
  rendering across two places.
- **Text is SNS now, vendor later.** SNS transactional SMS needs no
  contract and works in the SNS sandbox against verified numbers, which is
  enough for staging. Carrier registration (10DLC or a toll-free number,
  weeks of lead time) must be filed early. Voice is not SNS; it waits for a
  provider, behind the same shape.
- **Email identity.** The sending domain is verified once per account
  (staging, production) with DKIM and a MAIL FROM subdomain; the sending
  address and reply-to come from `config/site.ts`. Production access is
  requested per account early; until then SES only delivers to verified
  recipients.
- **Never in a notification body:** regulated detail, a secret, a reason
  for a denial. The body carries the record number and a link; the record
  carries the facts.

### 1.3 Steps

| # | Step | Depends on |
|---|---|---|
| N1 | Console: verify the domain, DKIM, MAIL FROM, request production access, create a configuration set with an event destination to `SESNotificationTopic` | nothing |
| N2 | `amplify/shared/notify/` adapters (email over SES v2, SMS over SNS), `NOTIFY_MODE`, `grantNotify()`, unit tests with mocked clients | N1 for a live test |
| N3 | The first module's `dispatch()` calls the adapters for EMAIL and SMS; sandbox proof with a real send | N2 |
| N4 | `ses-webhook-handler` writes DELIVERED, BOUNCED, COMPLAINED back by provider message id; suppression list on hard bounce and complaint | N2 |
| N5 | Newsletter confirm and welcome mails (the two TODOs) on the same adapter | N2 |
| N6 | Core `NotificationDelivery` model, an inbox read model, org rules (one reminder per person per day, quiet hours), a digest | N2 |

---

## 2. Assist on Amazon Bedrock

### 2.1 The pattern

`docs/ai-features.md` sets the inline pattern: a button calls an AppSync
custom mutation, a Lambda builds a scoped prompt, calls the model, returns
a suggestion the person reviews; never auto-saved. `docs/in-app-copilot.md`
sets the assistant pattern (a streaming route over tool handlers, running
as the user). Rules that bind every helper: Assist drafts, flags, explains
and prepares; a person confirms; suggested shows light; never a
consequential determination on its own; never name the model vendor on
screen; every helper has a switch, an allow list, a cost cap and a kill
switch.

### 2.2 Enablement

- **Bedrock in each account.** Request model access in the staging and
  production accounts. Use the cross-region inference profile ids
  (`us.anthropic...`) so a model not yet hosted in the home region still
  answers from the regional set and the data stays in-region. Model ids are
  looked up at enablement and set per environment, never hardcoded:
  `ASSIST_MODEL_DRAFT` (a Sonnet-class model for drafting),
  `ASSIST_MODEL_FAST` (a Haiku-class model for classification, suggestions
  and themes).
- **Why Bedrock, not the vendor API.** IAM instead of an API key, usage
  stays inside the AWS account and region, Bedrock is in scope for the
  AWS business associate agreement a regulated stack needs, and Bedrock
  Guardrails give a PII filter such a stack requires.
- **Guardrails.** One Bedrock Guardrail per environment: PII anonymization
  on input and output, denied topics, and a word filter for the never-say
  list. `ASSIST_GUARDRAIL_ID` is optional; without it the call runs bare.

### 2.3 Flow

```
button -> AppSync custom mutation assistRun(helperId, recordType, recordId)
  -> amplify/functions/assist-run/ (command: rejects before anything is written)
       1. switch check: helper on for this org? Assist on at all? (kill switch)
       2. allow list: load only the fields the helper may read, through the owner's read model
       3. cost meter: runs and tokens this month for this org; over the hard cap -> rules-only
       4. rules first: if a rule answers, no model call
       5. Bedrock Converse with a versioned prompt and a JSON output schema (forced tool use)
          so the answer is structured, never free text
       6. write an AssistEvent row: helper, prompt version, model, tokens, input hash, output, state PROPOSED
       7. return the suggestion; the screen shows it light
confirm -> the owning product's normal write path; assistDecide flips the AssistEvent to ACCEPTED
           or EDITED (with what was kept) or REJECTED; the confirm is the audit row
```

### 2.4 As built (2026-10-05)

| Piece | Where | Notes |
|---|---|---|
| Helper seam | `amplify/shared/assist/types.ts` (foundation), `amplify/data/assist-helpers.ts` (product registry, handler-safe) | A helper owns its access check, its allow list (`load`), its prompt, its output schema and its parser. It never writes |
| Switches and cap | `amplify/shared/assist/settings.ts` | `Organization.settings.assist = { enabled, helpers: { [id]: bool }, monthlyRunCap }`; precedence: environment `ASSIST_MODE` (off, rules, live), the org kill switch, the helper switch, the helper's shipped default; over the cap, rules only |
| Model call | `amplify/shared/assist/bedrock.ts` | Bedrock Converse with a forced tool, so every answer is JSON in the helper's schema; temperature 0; one retry on throttling; optional Guardrail; the model id is an inference profile from the environment |
| Log and meter | `AssistEvent`, `AssistUsage` in `amplify/data/resource.ts` | Lambda-written, org groups read. The event is the Assist log: helper, prompt version, model, input hash, output, decision, who. Usage is one row per org per month |
| Command | `amplify/functions/assist-run/` | `assistRun` (resolve caller, switches, load, rules first, cache by input hash plus prompt version plus model, call, log, meter) and `assistDecide` (ACCEPTED, EDITED with what was kept, REJECTED) |
| Client | `lib/assist/use-assist.ts`, `app/components/AssistSuggestion.tsx` | The suggestion shows light; Accept and Edit write through the product's own update and then record the decision; Reject records it and writes nothing |
| Environment | `amplify/backend.ts` | `ASSIST_MODE` defaults to off, so a fresh account deploys with Assist dark; `ASSIST_MODEL_FAST` and `ASSIST_MODEL_DRAFT` default to the Claude Haiku 4.5 and Sonnet 4.5 US inference profiles and are overridable per branch; `ASSIST_MONTHLY_RUN_CAP` defaults to 500; `ASSIST_GUARDRAIL_ID` optional |
| Tests | `settings.test.ts`, `bedrock.test.ts` | switch precedence and cap, tool extraction |

**Adding a helper** (the product side): a file in the owning module's
`amplify/functions/<module>-shared/` exporting a `HelperDefinition` (id,
product, allow groups, `access`, `load`, `prompt`, `schema`, `parse`), one
line in `amplify/data/assist-helpers.ts`, a screen that calls `useAssist`
and renders `AssistSuggestion`, and three tests: two hostile inputs, the
switch-off case, the cap fallback. To go live: enable model access in the
account, set `ASSIST_MODE=live` on the branch, redeploy.

Not built: an Assist log tab on records, an Admin switch screen (the JSON
in `Organization.settings` is the switch today), a Guardrail per
environment, restoring a pending suggestion after a reload, and the
streaming assistant (pattern B in `docs/in-app-copilot.md`).

---

## 3. Document export: PDF and Word

### 3.1 Rules

The export is the product; one export service, no module writes its own;
branded once from the organization's brand record; nothing unconfirmed
exports (the request is refused at anything above zero suggested values);
every export is logged (who, what, when, format); the organization header,
the data date and the confirmed count print on the document; deterministic
(the same snapshot, template and renderer version give the same document).

### 3.2 Design

One export service with one intermediate document model and two
renderers.

```
product screen -> requestExport(recordType, recordId, format, template, affirmed)   command mutation
  -> the record's provider (amplify/data/export-providers.ts): access, readiness, the document model
  -> ExportJob row (core): QUEUED                                                     status for the screen
  -> amplify/custom/export-renderer/ (stream handler on ExportJob)
       1. claim the row RENDERING (conditional, replay-safe)
       2. fetch and resize figures via sharp from the storage bucket
       3. render: PDF via @react-pdf/renderer (Word via docx later); both read the same model
       4. write exports/<orgId>/<jobId>/<file>; hash the bytes; ExportJob -> READY with key, hash, size, pages
  -> screen polls the job (lib/export/use-export-job.ts) and fetches getExportDownload: a presigned 15 minute GET
```

Decisions:

- **A document model between data and files.** `lib/export/model.ts`
  (pure, no DOM, testable) describes a document as blocks. Products build
  the model from their own data; the renderers never see product types.
  This is what makes two formats agree and makes the output testable with
  golden fixtures.
- **Libraries.** `@react-pdf/renderer` for PDF: pure JavaScript, React
  components, deterministic layout, no headless browser on Lambda, bundled
  Inter so no outside font host. `docx` for Word (later): pure JavaScript,
  real paragraphs and tables. Headless Chromium was rejected: a 50 MB
  layer, cold starts of seconds, and layout that drifts with the browser
  version, which breaks determinism.
- **Determinism.** Renderer version and template version are stamped on
  the job; PDF metadata dates come from the data date, not the clock;
  fonts ship with the asset. A golden fixture per template is compared on
  the document model and on extracted text per release.
- **Async by default.** A report with sixty photos exceeds 30 seconds; the
  stream-handler shape gives the retry and the status row for free. The
  Lambda runs with 2 GB memory and a 5 minute timeout.
- **Where files live.** The storage bucket under `exports/<orgId>/<jobId>/`,
  Lambda-only: no client storage rule, the renderer writes, the request
  function presigns after an org check. Delivery is a presigned GET rather
  than the media CDN because the CDN knows `uploads/` and `logos/` and
  pushes everything through the image transform.
- **A raw CDK function.** `defineFunction` cannot bundle
  `@react-pdf/renderer` (pdfkit resolves its standard fonts through package
  subpath imports that esbuild leaves unresolved), so the renderer follows
  the media CDN's install-hook pattern: a `NodejsFunction` whose asset
  installs `@react-pdf/renderer`, `react` and `sharp` pinned to the repo's
  versions after bundling. It has no `allow.resource` grant, so it updates
  its own row through the table; the write still streams to the audit trail.

### 3.3 As built (2026-10-05)

| Piece | Where | Notes |
|---|---|---|
| Document model | `lib/export/model.ts` | Pure; `validateDocument` is the unconfirmed gate every renderer trusts; `exportFileName` gives `<Org>-<Record>-<Document>-<data date>-v1.<ext>` |
| Provider seam | `amplify/shared/export/types.ts` (foundation), `amplify/data/export-providers.ts` (product registry, handler-safe: no schema imports) | One provider per record type; it owns access, readiness and the document |
| Job model | `ExportJob` in `amplify/data/resource.ts` | Lambda-written, org groups read; the row is the export log (who, data date, hash, size, pages, renderer version) |
| Request and download | `amplify/functions/export-request/` | `requestExport` is a command (refuses before any row: no provider, no access, not affirmed, unconfirmed values) and queues the row over AppSync; `getExportDownload` presigns a 15 minute S3 GET after an org check |
| Renderer | `amplify/custom/export-renderer/` | Arm64, 2 GB, 5 min, on the `ExportJob` stream. Inter ships in `fonts/`. Marks READY with sha256, size and page count, or FAILED with the reason |
| Storage | `amplify/storage/resource.ts` | No client rule on `exports/`: nothing but the two functions touches it |
| Client | `lib/export/use-export-job.ts` | Request, poll the job every two seconds for up to five minutes, fetch the link; one hook for every product |
| Tests | `lib/export/model.test.ts`, `amplify/custom/export-renderer/pdf.test.ts` (same bytes twice, bytes change with data) | |

Not yet exercised against a sandbox: the stream mapping, the install hook
on Hosting's build image, and a real photo through sharp. `npm run
check:backend` synthesizes the function and runs the hook locally.

**Adding a provider** (the product side): a file in the owning module's
`amplify/functions/<module>-shared/export.ts` exporting an `ExportProvider`
(`recordType`, `access`, `build` → `DocumentModel`), one line in
`amplify/data/export-providers.ts`, a dialog that calls `useExportJob`, and
a golden-fixture test on the document model.

### 3.4 Steps

| # | Step | Depends on |
|---|---|---|
| E1 | Document model and a golden fixture — done | |
| E2 | `ExportJob`, `requestExport`, the stream handler — done | E1 |
| E3 | PDF renderer — done | E1 |
| E4 | Word renderer (`docx`) from the same model | E1 |
| E5 | Brand record (`OrgBrand`: logo key, colours, signature block, name as it prints); until then the header prints the organization name | E3 |
| E6 | Images: strip location, burn redactions; manifest; release copies with a release log page | E3 |

---

## 4. Order across the three

1. **N1 and Bedrock model access now** (console work with approval lead
   times).
2. **Export** first in code: nothing in it waits on an outside approval.
3. **Notifications adapters** next: the first outbound send proves the
   seam.
4. **Assist helpers** after: the first helper proves the log, switch and
   cap mechanics before any drafting helper ships.
