# Core Data Model

Reference for the foundation models in the Amplify Gen 2 Data schema
(`amplify/data/resource.ts`). All models are defined via `defineData()` /
`a.model()` and backed by DynamoDB (one table per model, AppSync GraphQL API in
front). The foundation covers multi-tenancy, identity, audit logging, lead
capture, and Stripe billing; product-specific ("vertical") domain models layer
on top following the conventions in this document.

Contents:

1. [Architecture summary](#1-architecture-summary)
2. [Design conventions](#2-design-conventions)
3. [Foundation enums](#3-foundation-enums)
4. [Foundation models](#4-foundation-models)
5. [Custom types and mutations](#5-custom-types-and-mutations)
6. [Extending with vertical models](#6-extending-with-vertical-models)
7. [Doc/code discrepancies noticed](#doccode-discrepancies-noticed)

---

## 1. Architecture summary

```
Next.js (App Router) ──▶ AWS AppSync (GraphQL) ──▶ DynamoDB (one table per model)
        │                       ▲                        │
        │                  Cognito (auth)          DynamoDB Streams
        ▼                       │                        ▼
   S3 Storage ── S3 events ──▶ Lambda triggers ── SigV4-signed mutations ──▶ AppSync
```

- **Event-driven server logic:** DynamoDB Stream triggers and S3 event triggers
  implement server-side workflows (audit logging, provisioning, file
  validation, email flows, billing sync). Each Lambda calls back into AppSync
  with IAM SigV4-signed GraphQL mutations — the "stored procedure" pattern.
  Clients cannot bypass these workflows.
- **External webhook handlers** (Stripe via Lambda Function URL, SES via SNS)
  follow the same call-back-into-AppSync pattern.
- **DynamoDB constraints:** no JOINs; relationships are modeled with Amplify
  helpers (`a.hasMany()` / `a.belongsTo()`); every cross-entity query needs a
  secondary index (GSI); Amplify auto-generates `id`, `createdAt`, `updatedAt`
  on every model.
- **Auth:** Amazon Cognito user pool is the default authorization mode. Roles
  are Cognito User Groups. An API key mode (365-day expiry) exists solely for
  the public pre-auth write path (newsletter signup).

---

## 2. Design conventions

These conventions apply to every model — foundation and vertical alike.

### 2.1 Tenancy: `orgId` scoping

`Organization` is the tenant boundary. Every tenant-scoped model carries an
`orgId: a.id()` field (required on all models except `User`, where it is null
until onboarding completes) plus a `belongsTo('Organization', 'orgId')`
relationship and an `orgId`-partitioned GSI as its primary list index.

Tenant isolation is enforced at three levels:

1. **Application layer (primary, current):** every list/get query includes the
   authenticated user's `orgId` from their claims.
2. **Auth rules:** Cognito group-based rules at the model level.
3. **Resolver-level enforcement (future defense in depth):** custom resolvers
   can inject `orgId` filtering.

Two kinds of models are deliberately *not* tenant-scoped:

- **Pre-auth models** (`NewsletterSubscriber`) — anonymous visitors have no
  org yet.
- **Platform/ops models** (`StripeWebhookEvent`) — `orgId` is optional and
  resolved after the fact; the record must exist even when the org lookup
  fails.

An optional second scoping level exists via `Site` (a location/facility within
an org). Models that support per-site partitioning carry an optional
`siteId: a.id()`; `siteId = null` means org-wide.

### 2.2 GSI design and naming

- **One GSI per access pattern.** Every query the UI or a Lambda needs is
  served by a purpose-built index; there is no scan-and-filter.
- **Query field naming:** `queryField` follows
  `<pluralModelName>By<Dimension>` — e.g. `usersByOrg`, `sitesByOrg`,
  `eventLogsByEntity`, `subscriptionsByStripeSubscriptionId`.
- **List indexes:** partition on the foreign key (`orgId`, `siteId`, parent
  id, actor id) with a sort key that matches the natural display order —
  chronological (`sortDate`), alphabetical (`name`, `title`), or a status /
  date field for dashboard filters (e.g. `status`, `currentPeriodEnd`).
- **Unique-lookup indexes:** partition-only GSIs (no sort key) on naturally
  unique fields — `slug`, `cognitoSub`, `email`, `stripeCustomerId`,
  `stripeSubscriptionId`, `stripeEventId`, one-time tokens. Uniqueness itself
  is enforced in application/trigger code (query first, then create), not by
  DynamoDB.
- **Budget:** DynamoDB allows 20 GSIs per table; Amplify creates one table per
  model, so the budget is per model.

### 2.3 The `sortDate` pattern

Models that need chronological GSI ordering carry an explicit
`sortDate: a.datetime().required()` field used as the GSI sort key, instead of
relying on the auto-managed `createdAt`. Rules:

- Set `sortDate` to the creation timestamp at create time (client or Lambda).
- Never mutate it afterward — it exists purely for stable index ordering.
- Use it as the sort key on every "list X chronologically" GSI
  (`usersByOrg`, `eventLogsByOrg`, `subscriptionsByOrg`, ...).

### 2.4 Computed-key pattern

When an access pattern needs a composite partition key, store a computed
string field and index it. The canonical example is
`EventLog.entityKey = "${entityType}#${entityId}"`, set server-side by the
`eventLogger` Lambda. The `eventLogsByEntity` GSI partitions on `entityKey`
(+ `sortDate` sort), answering "show the full history of this one entity" with
a single query. Use `TYPE#id` (uppercase type, `#` separator) for any similar
composite lookup.

### 2.5 Authorization rule patterns

All model access is declared with `a.authorization()`. Recurring patterns:

- **Group-tier pattern (standard CRUD models):** three Cognito groups —
  `Admin` (full CRUD), a manager-level group (currently named
  `Member` (formerly `QualityManager` in the original vertical; CRUD on domain models, read on org/user administration),
  and `Viewer` (read-only). Admin-managed models (Organization, User, Site):

  ```ts
  .authorization((allow) => [
    allow.group('Admin').to(['create', 'read', 'update', 'delete']),
    allow.groups(['Member', 'Viewer']).to(['read']),
  ])
  ```

- **Server-written models:** models written only by Lambdas (`EventLog`,
  `OrgSubscription`, `StripeWebhookEvent`) expose *read-only* group rules — no
  client mutation exists at all. Writes happen exclusively through the
  schema-level Lambda grants (below).

- **Schema-level Lambda access grants:** every trigger/handler function is
  granted IAM access on the schema (not per model):

  ```ts
  .authorization((allow) => [
    allow.resource(eventLoggerFunction).to(['query', 'mutate']),
    allow.resource(stripeWebhookHandlerFunction).to(['query', 'mutate']),
    // ... one line per function
  ]);
  ```

  Lambdas authenticate to AppSync with IAM SigV4 — never with a user's
  Cognito token — so server-side writes cannot be forged from a client.

- **`publicApiKey` for pre-auth capture:** the only API-key rule in the schema
  is `NewsletterSubscriber`'s `allow.publicApiKey().to(['create'])` —
  unauthenticated visitors can submit an email and nothing else. Everything
  sensitive on that model (tokens, status transitions) is set server-side by
  the subscriber trigger.

- **`allow.authenticated()` for custom mutations:** custom operations that any
  signed-in user may call (e.g. `createCheckoutSession`) use
  `allow.authenticated()` and delegate to a Lambda handler.

- **Authorization modes:** `defaultAuthorizationMode: 'userPool'`;
  `apiKeyAuthorizationMode: { expiresInDays: 365 }`.

### 2.6 Stripe-mirroring conventions

Stripe is always the source of truth for billing; the database holds a local
mirror maintained exclusively by the `stripeWebhookHandler` Lambda:

- **ID mirroring:** Stripe object IDs are stored verbatim in `stripe*` string
  fields (`stripeCustomerId` on Organization, `stripeSubscriptionId` /
  `stripePriceId` / `stripeProductId` / `latestInvoiceId` on
  `OrgSubscription`), each with a lookup GSI where a webhook needs to resolve
  it (`organizationsByStripeCustomerId`,
  `subscriptionsByStripeSubscriptionId`).
- **Webhook-only writes:** clients never write `OrgSubscription` or
  `StripeWebhookEvent`; the Checkout success redirect is *not* trusted — the
  `checkout.session.completed` webhook is.
- **Idempotency via `stripeEventId`:** every webhook delivery is recorded as a
  `StripeWebhookEvent` before processing. The handler first queries the
  `stripeWebhookEventsByStripeEventId` GSI: if the event exists with status
  `PROCESSED` it is skipped (Stripe retries become no-ops); `FAILED` events
  may be retried. Processing status lifecycle: `RECEIVED` → `PROCESSED` /
  `FAILED` (plus `SKIPPED`).
- **Org resolution:** webhooks resolve the tenant via
  `organizationsByStripeCustomerId`, falling back to the `orgId` passed as
  Checkout Session `metadata` when the session was created.
- **Tier from Stripe metadata:** `OrgSubscription.tier` is derived from a
  `tier` metadata key on the Stripe Product — never from a hardcoded Price ID
  map — so pricing changes are a Stripe Dashboard operation, not a deploy.
- **Access control off `currentPeriodEnd`:** an org has access when status is
  `ACTIVE`/`TRIALING` and `currentPeriodEnd > now`; `CANCELED` retains access
  until `currentPeriodEnd`; `PAST_DUE` gets a configurable grace period.

### 2.7 Soft delete and immutability

Records that matter for audit or billing history are never hard-deleted:

- **Deactivation flag:** `isActive: a.boolean().default(true)` on
  administrative models (Organization, User, Site) — "delete" means
  deactivate.
- **Soft-delete flag:** `isDeleted: a.boolean().default(false)` on
  user-content models that must stay queryable for history; list queries
  filter `isDeleted = false`.
- **Status-transition retirement:** models with a lifecycle enum
  (`NewsletterSubscriber`, `OrgSubscription`) retire records by status
  (`UNSUBSCRIBED`, `CANCELED`), never by deletion.
- **Append-only tables:** `EventLog` and `StripeWebhookEvent` are immutable
  audit trails — no client update or delete path exists.

### 2.8 EventLog integration

The audit trail is written only by the `eventLogger` Lambda, fired from
DynamoDB Streams on the tables it watches. Client-side logging is never
trusted: a stream trigger guarantees every write produces a log entry
regardless of what initiated it. The trigger:

- On INSERT: logs `CREATED` with a snapshot payload.
- On MODIFY: diffs OldImage vs NewImage, skips no-op touches (only
  `updatedAt` changed), and maps the change to an action — `STATUS_CHANGED`
  (with old/new status in payload), `DELETED` (soft-delete flag flipped), or
  `UPDATED` (field diff in payload).
- Extracts `actorUserId` from a denormalized actor field on the source record
  (e.g. `uploadedBy`, `verifiedBy`) — never from a client-supplied value —
  and resolves `actorEmail` for display without a join.
- Computes `entityKey` and sets `sortDate` server-side.

---

## 3. Foundation enums

### SubscriptionTier

Tiers map to Stripe Prices; the tier label lives in Stripe Product metadata
(see 2.6). The current set is `CORE`, `GROWTH`, `SCALE`, `TRIAL` — rename or
extend per product; limits and pricing live in Stripe and app config, not in
the schema.

### SubscriptionStatus

Mirrors Stripe subscription statuses; synced by webhook. `TRIALING`, `ACTIVE`,
`PAST_DUE`, `UNPAID`, `CANCELED`, `INCOMPLETE`, `INCOMPLETE_EXPIRED`,
`PAUSED`. See 2.6 for the access-control interpretation of each.

### SubscriberStatus

Newsletter double opt-in lifecycle: `PENDING` (confirmation email sent),
`CONFIRMED` (link clicked), `UNSUBSCRIBED`, `BOUNCED` (SES hard bounce, or 3+
soft bounces), `COMPLAINED` (SES spam complaint).

### SubscriberSource

Which CTA captured the lead: `HOMEPAGE_HERO`, `HOMEPAGE_PRICING`, `FOOTER`,
`BLOG`, `REFERRAL`, `OTHER`. Extend per product's landing pages.

### EventAction

What happened, for `EventLog.action`. Foundation values:

| Value | Meaning |
|-------|---------|
| `CREATED` / `UPDATED` / `DELETED` | Generic entity lifecycle (DELETED = soft delete) |
| `STATUS_CHANGED` | Any status enum transition (old/new in payload) |
| `APPROVED` / `REJECTED` | Generic approval decisions |
| `EXPORTED` | An export artifact was generated |
| `SUBSCRIBER_CONFIRMED` / `SUBSCRIBER_UNSUBSCRIBED` | Newsletter opt-in lifecycle |
| `SUBSCRIPTION_CREATED` / `SUBSCRIPTION_UPDATED` / `SUBSCRIPTION_CANCELED` | Stripe subscription lifecycle |
| `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` | Stripe invoice outcomes |

Verticals append domain-specific actions to this enum (the compliance vertical
added e.g. `TRAINING_COMPLETED`, `FILE_VALIDATED`).

### EntityType

Discriminator for `EventLog.entityType` / `entityKey`. Foundation values:
`ORGANIZATION`, `USER`, `SITE`, `NEWSLETTER_SUBSCRIBER`, `SUBSCRIPTION`,
`STRIPE_WEBHOOK_EVENT`. Each vertical model adds one value (uppercase snake
case of the model name).

---

## 4. Foundation models

All models additionally have auto-generated `id` (primary key), `createdAt`,
and `updatedAt`.

### Organization

The tenant boundary. A user's `orgId` claim determines what data they can
access; all tenant data hangs off this model.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `name` | String | yes | Display name |
| `slug` | String | yes | URL-safe identifier (unique, app-enforced) |
| `industry` | String | no | Industry vertical |
| `address` / `phone` / `website` | String | no | Contact details |
| `logoS3Key` | String | no | S3 key for the org logo |
| `settings` | JSON | no | Flexible org-level settings bag |
| `stripeCustomerId` | String | no | Stripe Customer ID (`cus_...`), set on first checkout; 1:1 with the org |
| `isActive` | Boolean | default `true` | Deactivation flag (never hard-delete) |

**Relationships:** `hasMany` to the foundation's org-scoped models (`users`,
`sites`, `subscriptions`). Vertical/module models scope by `orgId` + GSI
without a relationship (see §6).

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `organizationsBySlug` | `slug` | — | Unique org lookup by URL slug |
| `organizationsByStripeCustomerId` | `stripeCustomerId` | — | Webhook handler resolves org from a Stripe customer |

**Authorization:** `Admin` full CRUD; `Member` and `Viewer` read.
Provisioning side effects (seeding defaults for a new org) run in an
`organizationTrigger` stream Lambda on INSERT.

### User

A person who can log in, linked 1:1 to a Cognito identity. Belongs to at most
one Organization; `orgId` is null until onboarding completes.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `orgId` | ID | no | Tenant FK (null pre-onboarding) |
| `cognitoSub` | String | yes | Cognito user pool `sub` — the identity link |
| `email` | String | yes | Matches the Cognito email |
| `firstName` / `lastName` | String | no | Name |
| `role` | String | no | Denormalized from the Cognito group for query convenience; the Cognito group remains the source of truth for authorization |
| `jobTitle` | String | no | Position |
| `isActive` | Boolean | default `true` | Deactivation flag |
| `lastLoginAt` | DateTime | no | Last login timestamp |
| `sortDate` | DateTime | yes | Chronological GSI sort key (see 2.3) |

**Relationships:** `belongsTo(Organization)`; verticals may add `hasMany`
links for actor-style references (e.g. records a user created or approved).

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `usersByOrg` | `orgId` | `sortDate` | List users in an org |
| `usersByCognitoSub` | `cognitoSub` | — | Resolve the app User from the Cognito identity at login |

**Authorization:** `Admin` full CRUD; `Member` and `Viewer` read.

### Site

A physical location/facility within an organization — the optional second
scoping level (see 2.1). Records elsewhere with `siteId = null` are org-wide.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `orgId` | ID | yes | Tenant FK |
| `name` | String | yes | Site display name |
| `siteCode` | String | no | Short identifier (e.g. "AUS-01") |
| `address` | String | no | Facility address |
| `isActive` | Boolean | default `true` | Deactivation flag |

**Relationships:** `belongsTo(Organization)`; verticals add `hasMany` from
Site for each site-scoped model.

**Indexes:** `sitesByOrg` — `orgId` (partition) + `name` (sort): list an
org's sites alphabetically.

**Authorization:** `Admin` full CRUD; `Member` and `Viewer` read.

### EventLog

Append-only audit trail. No client-facing create/update/delete — writes
happen exclusively through the `eventLogger` Lambda (see 2.8) via the
schema-level IAM grant.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `orgId` | ID | yes | Tenant FK (partition for org activity feed) |
| `siteId` | ID | no | Optional site context |
| `actorUserId` | ID | yes | Who performed the action (extracted server-side) |
| `actorEmail` | String | no | Denormalized for display without a join |
| `entityType` | `EntityType` | yes | What kind of entity was affected |
| `entityId` | ID | yes | Which entity |
| `entityKey` | String | no | Computed `"${entityType}#${entityId}"`, set by the Lambda (see 2.4) |
| `action` | `EventAction` | yes | What happened |
| `payload` | JSON | no | Snapshot or field diff |
| `ipAddress` | String | no | Actor IP, if available |
| `sortDate` | DateTime | yes | Chronological sort key |

**Relationships:** none — standalone, denormalized, append-only.

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `eventLogsByOrg` | `orgId` | `sortDate` | Org activity feed |
| `eventLogsByEntity` | `entityKey` | `sortDate` | Full history of one entity |
| `eventLogsByActor` | `actorUserId` | `sortDate` | Everything one user did |
| `eventLogsBySite` | `siteId` | `sortDate` | Site-level audit trail |

**Authorization:** read-only for `Admin`, `Member`, `Viewer`; no
mutations exposed to any user. Fully immutable.

### NewsletterSubscriber

Pre-authentication lead capture with double opt-in (CAN-SPAM/GDPR). **Not
org-scoped** — these are anonymous visitors. Public-write, admin-read. The
flow: client creates the record via API key; a stream trigger normalizes the
email, deduplicates via `subscribersByEmail`, generates tokens server-side,
and sends the confirmation email via SES; token-lookup endpoints flip status;
an SES webhook handler (via SNS) sets `BOUNCED`/`COMPLAINED`.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `email` | String | yes | Normalized lowercase; deduped in the trigger |
| `firstName` / `lastName` / `company` / `jobTitle` | String | no | Optional lead-qualification fields |
| `source` | `SubscriberSource` | yes | Which CTA captured the lead |
| `status` | `SubscriberStatus` | yes | Opt-in lifecycle (default `PENDING`) |
| `confirmationToken` | String | no | Double opt-in token — generated server-side, UUID, never listed |
| `confirmedAt` | DateTime | no | When the confirmation link was clicked |
| `unsubscribedAt` | DateTime | no | When the subscriber opted out |
| `unsubscribeToken` | String | no | One-click unsubscribe token — server-generated |
| `referralCode` | String | no | Referral/UTM tracking code |
| `ipAddress` / `userAgent` | String | no | Captured at signup as GDPR consent evidence |
| `tags` | [String] | no | Segmentation tags |
| `lastEmailSentAt` | DateTime | no | Rate limiting / send tracking |
| `emailBounceCount` | Int | no | Soft-bounce counter (3+ → `BOUNCED`) |
| `metadata` | JSON | no | UTM params, A/B variants, campaign IDs |
| `sortDate` | DateTime | yes | Chronological sort key |

**Relationships:** none — standalone.

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `subscribersByEmail` | `email` | — | Dedupe signups; SES webhook lookup |
| `subscribersByStatus` | `status` | `sortDate` | Campaign send lists (`CONFIRMED` only) |
| `subscribersBySource` | `source` | `sortDate` | CTA conversion tracking |
| `subscribersByConfirmationToken` | `confirmationToken` | — | Double opt-in confirmation endpoint |
| `subscribersByUnsubscribeToken` | `unsubscribeToken` | — | One-click unsubscribe endpoint |

**Authorization:** `allow.publicApiKey().to(['create'])` (unauthenticated
signup); `Admin` read/update (subscriber data is PII). Never deleted — opt-out
is a status transition. Server-side updates go through the schema-level Lambda
grants.

### OrgSubscription

Local mirror of a Stripe Subscription. Stripe is the source of truth; created
and updated exclusively by the `stripeWebhookHandler` Lambda. Each org has at
most one active subscription (app-enforced); historical rows are retained for
billing history.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `orgId` | ID | yes | Tenant FK |
| `stripeSubscriptionId` | String | yes | `sub_...` — unique |
| `stripeCustomerId` | String | yes | `cus_...` — denormalized for webhook lookup |
| `stripePriceId` | String | yes | `price_...` — the specific plan/price |
| `stripeProductId` | String | no | `prod_...` |
| `tier` | `SubscriptionTier` | yes | Derived from Stripe Product metadata (see 2.6) |
| `status` | `SubscriptionStatus` | yes | Mirrors the Stripe status |
| `currentPeriodStart` / `currentPeriodEnd` | DateTime | no | Billing period; `currentPeriodEnd` drives access control |
| `trialStart` / `trialEnd` | DateTime | no | Trial window |
| `cancelAtPeriodEnd` | Boolean | no | Canceled but still within paid period |
| `canceledAt` / `endedAt` | DateTime | no | Cancellation vs. final end timestamps |
| `latestInvoiceId` / `latestInvoiceStatus` / `latestInvoiceUrl` | String | no | Most recent invoice (`paid`/`open`/`void`/`uncollectible`; hosted URL) |
| `metadata` | JSON | no | Extra Stripe metadata |
| `sortDate` | DateTime | yes | Chronological sort key |

**Relationships:** `belongsTo(Organization)`.

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `subscriptionsByOrg` | `orgId` | `sortDate` | Current + historical subscriptions for an org |
| `subscriptionsByStripeSubscriptionId` | `stripeSubscriptionId` | — | Webhook handler lookup |
| `subscriptionsByStripeCustomerId` | `stripeCustomerId` | `sortDate` | Lookup by Stripe customer |
| `subscriptionsByStatus` | `status` | `currentPeriodEnd` | Ops: find all orgs in a given billing state (e.g. `PAST_DUE`) |

**Authorization:** read-only for `Admin`, `Member`, `Viewer` (any org
user can check their own subscription status); writes only via the webhook
Lambda's schema-level grant. Never deleted.

### StripeWebhookEvent

Idempotent processing log for Stripe webhook deliveries, and the billing
audit trail. Every delivery is recorded before processing so retried/duplicate
webhooks are safe (see 2.6).

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `stripeEventId` | String | yes | `evt_...` — unique; the idempotency key |
| `eventType` | String | yes | Stripe event type (e.g. `checkout.session.completed`) |
| `stripeCustomerId` / `stripeSubscriptionId` | String | no | Cross-references from the event |
| `orgId` | ID | no | Resolved org (via `organizationsByStripeCustomerId` or session metadata) |
| `status` | String | yes | `RECEIVED` → `PROCESSED` / `FAILED` / `SKIPPED` |
| `payload` | JSON | yes | Full Stripe event JSON (debugging + audit; never exposed to non-admins) |
| `errorMessage` | String | no | Failure details |
| `processedAt` | DateTime | no | When processing completed |
| `sortDate` | DateTime | yes | Chronological sort key |

**Relationships:** none — standalone.

**Indexes:**

| Query field | Partition | Sort | Why |
|-------------|-----------|------|-----|
| `stripeWebhookEventsByStripeEventId` | `stripeEventId` | — | Idempotency check (already processed?) |
| `stripeWebhookEventsByOrg` | `orgId` | `sortDate` | Billing event history for an org |
| `stripeWebhookEventsByEventType` | `eventType` | `sortDate` | Debugging/monitoring by event type |

**Authorization:** `Admin` read only; writes only via the webhook Lambda's
schema-level grant. Immutable audit trail.

---

## 5. Custom types and mutations

### CheckoutSessionResponse (custom type)

```ts
CheckoutSessionResponse: a.customType({
  clientSecret: a.string().required(),
})
```

### createCheckoutSession (mutation)

```ts
createCheckoutSession: a.mutation()
  .arguments({ tier: a.ref('SubscriptionTier').required(), orgId: a.id().required() })
  .returns(a.ref('CheckoutSessionResponse'))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(createCheckoutSessionFunction))
```

The Lambda looks up or creates the Stripe Customer (storing
`stripeCustomerId` on the Organization if new), creates a Stripe Checkout
Session in `subscription` mode with `metadata: { orgId }` (critical — the
webhook handler uses it to resolve the org), and returns the session's
`clientSecret` for the client to complete checkout. The
`checkout.session.completed` webhook — not the client redirect — creates the
`OrgSubscription` record; the client polls for it after returning.

---

## 6. Extending with vertical models

A new product's domain models plug into the foundation by following the
conventions above:

- **Tenancy:** every domain model gets `orgId: a.id().required()` and an
  `orgId`-partitioned GSI as its primary list index. Don't add
  `belongsTo('Organization', 'orgId')` unless you also add the matching
  `hasMany` on Organization in `resource.ts` — Amplify requires both sides
  and fails synth otherwise; vertical/module models should leave the
  foundation model alone and rely on the GSI. Add optional `siteId` scoping
  (with a `bySite` GSI) if the model is location-specific.
- **Indexes:** one GSI per access pattern; `queryField` named
  `<models>By<Dimension>`; add a required `sortDate` for chronological lists;
  partition-only GSIs for unique lookups; dashboard filters as
  `orgId` + status/date-sort-key GSIs.
- **Auth:** standard CRUD models get the group-tier pattern (Admin CRUD,
  manager-group CRUD, Viewer read); anything server-computed gets read-only
  group rules with writes via schema-level `allow.resource(fn)` grants for
  its trigger Lambdas.
- **EventLog integration:** add one `EntityType` value per model and any
  domain-specific `EventAction` values; wire the model's table stream into the
  `eventLogger` Lambda; keep a denormalized actor-id field (e.g.
  `uploadedBy`) on the model so the logger can attribute the action without
  trusting the client.
- **Lifecycle:** prefer `isActive`/`isDeleted` flags or status transitions
  over hard deletes for anything with audit value.

**Worked example (compliance vertical):** the original product layered
Document/DocumentVersion/Approval, Standard/Requirement,
EvidenceItem/EvidenceRequirement, and TrainingCourse/TrainingRecord models on
this foundation — each carrying required `orgId` (optional `siteId`), GSIs
like `documentsByOrg` (`orgId` + `title`) and dashboard indexes like
`trainingRecordsByOrgExpiry` (`orgId` + `expiryDate`), with
Admin/Member CRUD and Viewer read. Stream triggers implemented the
domain workflows (approval cascades, expiry calculation, async export), each
write flowing through `eventLogger` into the shared audit trail with new
EntityType/EventAction values such as `TRAINING_RECORD` and
`TRAINING_COMPLETED`.

---

## Doc/code discrepancies noticed

Where the original schema reference (`DATA_SCHEMA.md`) and the code
(`amplify/data/resource.ts`) disagreed, this document follows the code:

1. **Model name:** the doc calls the billing model `Subscription`; the code
   names it `OrgSubscription` (query fields still start with
   `subscriptions...`).
2. **Chronological sort keys:** the doc's index tables list `createdAt` as the
   sort key on most chronological GSIs (EventLog, NewsletterSubscriber,
   OrgSubscription, StripeWebhookEvent, and others); the code uses an explicit
   required `sortDate` field everywhere. The doc's field tables for EventLog,
   NewsletterSubscriber, and StripeWebhookEvent omit `sortDate` (and EventLog's
   omits `entityKey`) even though the code defines them.
3. **Lambda access grants:** the doc (sections 6 and 9.3) shows per-model
   `allow.resource(fn)` rules scoped to specific operations (least privilege);
   the code grants every function `['query', 'mutate']` at the schema level,
   i.e. broad IAM access to all models. The per-model rules shown in the doc's
   NewsletterSubscriber/Subscription/StripeWebhookEvent auth snippets do not
   exist in the code.
4. **Organization auth:** the doc's permissions matrix says Admin has only
   Read/Update on Organization ("only platform-level ops create orgs"); the
   code grants Admin full CRUD including create and delete.
5. **Checkout return value:** the doc's checkout flow (8.18) says the mutation
   returns a Checkout Session URL and redirects to Stripe-hosted checkout; the
   code's `CheckoutSessionResponse` returns a `clientSecret` (embedded
   checkout flow).
6. **`createPortalSession`:** described in the doc's Customer Portal flow but
   not defined in the schema.
7. **Minor:** the doc's Stripe cascade example mentions a `STARTER` tier that
   does not exist in the `SubscriptionTier` enum (`CORE`/`GROWTH`/`SCALE`/
   `TRIAL`).
