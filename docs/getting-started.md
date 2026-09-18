# Getting Started

Everything you need before you touch the code: what this repo is, how the
pieces fit together, what you must have in place first, and what is real
versus scaffolded.

> Read this once end-to-end, then use [`docs/ROADMAP.md`](ROADMAP.md) for
> current state and next steps, and [`docs/architecture.md`](architecture.md)
> for the long-form design.

---

## 1. What this repo is

A **white-label SaaS foundation**, not a finished product. It is meant to be
cloned per product: you edit a small configuration surface, define the
product's domain models in one seam file, and deploy. The foundation code
itself contains no product facts.

What it ships out of the box:

- A marketing site (landing sections, MDX blog, SEO machinery, newsletter capture)
- Cognito email auth with post-signup user provisioning
- A multi-tenant data model (`Organization` / `User` / `Site`) with an
  append-only `EventLog` audit trail
- Stripe embedded checkout with subscription mirroring models
- Event plumbing: DynamoDB streams → Lambda, S3 upload notifications, SES
  bounce/complaint handling, a Stripe webhook endpoint

The npm package is named `saas-platform`; the checkout directory name is
whatever product you cloned it into. That mismatch is expected — the package
name is the foundation's, the directory is the product's.

---

## 2. Prerequisites

### 2.1 Local tooling

| Requirement | Notes |
|---|---|
| **Node.js 20.9+** (22 LTS recommended) | Next.js 16 requires ≥20.9; Lambdas run on the Node 22 runtime, so 22 locally gives you parity |
| **npm** | The repo ships `package-lock.json`; per-function lockfiles exist too |
| **AWS CLI v2** | Needed for `aws configure sso` and reading CloudFormation outputs |
| **Git** | Product repos mirror this foundation — see [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

A first `npm install` is required — the repo is checked in without
`node_modules`.

### 2.2 Accounts and external services

1. **An AWS account per environment**, created inside an AWS Organization
   (management account + one member account per product/environment).
   Adding accounts to an org later is easy; migrating standalone accounts is
   not.
2. **IAM Identity Center (SSO)** configured, then `aws configure sso` to
   produce a **named CLI profile**. Every `ampx` command takes
   `--profile <name>`.
3. **A chosen AWS region**, recorded somewhere. Amplify, SES, and your
   webhook URLs all live in it.
4. **A Stripe account** with test-mode products and prices created for the
   three tiers (Core / Growth / Scale). You need the price IDs before the
   checkout Lambda will work.
5. **A sending domain** you control, for SES. New AWS accounts start in the
   SES sandbox (mail only to verified recipients) — request production
   access early, it is not instant. See [`SES_CONFIGURATION.md`](../SES_CONFIGURATION.md).
6. **Guardrails** worth doing on day one: an AWS Budgets alert, CloudTrail
   on, MFA on root.

### 2.3 Secrets you will need to set

Backend secrets go through `npx ampx sandbox secret set <NAME>` locally, and
through the Amplify console per branch for staging/production.

| Secret | Consumed by |
|---|---|
| `STRIPE_SECRET_KEY` | `create-checkout-session` |
| `STRIPE_PRICE_CORE` / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` | `create-checkout-session` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-handler` (available only *after* the first deploy — see §8) |

Non-secret environment values:

| Variable | Where | Purpose |
|---|---|---|
| `APP_URL` | shell env at synth time / Amplify console env var | Stripe `return_url`; defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env.local` (local) / Amplify console (deployed) | Frontend Stripe.js |

> `.env*` and `amplify_outputs*` are gitignored. Neither exists in a fresh
> clone; you create both (see §7).

---

## 3. The stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, MDX blog, three.js hero visual |
| Backend | AWS Amplify Gen 2 — Cognito, AppSync (GraphQL), DynamoDB, Lambda, S3, SES, SNS |
| Infra escape hatch | AWS CDK inside `amplify/backend.ts` |
| Billing | Stripe embedded checkout + webhooks |
| Hosting | AWS Amplify Hosting (branch → environment) |

---

## 4. Repo layout

```
app/                    Next.js App Router
  page.tsx              landing page (composes the marketing sections)
  layout.tsx            font + metadata + provider stack
  components/           marketing sections, auth modal, React contexts
  blog/                 MDX-backed blog (list, [slug], OG images)
  subscribe/            plan selection → Stripe embedded checkout → success
amplify/                Amplify Gen 2 backend
  backend.ts            defineBackend + all custom CDK wiring
  auth/resource.ts      Cognito (email login, 3 groups, post-confirmation trigger)
  auth/post-confirmation/  Lambda: create User row, assign default group
  data/resource.ts      foundation GraphQL schema (do not edit per product)
  data/vertical.ts      >>> the per-product domain-model seam <<<
  storage/resource.ts   S3 prefixes: uploads/ exports/ logos/
  functions/            7 Lambdas (see §6)
  shared/constants.ts   Cognito group names (backend source of truth)
components/ui/          shadcn/ui primitives
config/                 >>> the white-label switchboard <<<
  site.ts               identity, nav, SEO, OG colors
  pricing.ts            tiers, display prices, TIER_LIMITS entitlements
  theme.css             palette + semantic tokens
content/blog/           MDX posts
docs/                   architecture, data model, billing, playbooks
lib/                    blog loader, cn() utility
public/                 logo + favicon assets
```

---

## 5. Architecture

```
                    ┌────────────────────────────────────────────┐
  Browser  ────────▶│  Next.js (App Router) — Amplify Hosting     │
                    │  marketing · blog · /subscribe · providers  │
                    └───┬───────────────────────┬────────────────┘
                        │ Amplify JS client     │ Stripe.js
                        │ (userPool | apiKey)   │ (embedded checkout)
                        ▼                       ▼
                 ┌─────────────┐         ┌──────────────┐
   Cognito ─────▶│   AppSync   │         │    Stripe    │
   (userPool     │   GraphQL   │         └──────┬───────┘
    + groups)    └──────┬──────┘                │ webhook (Function URL)
                        │ resolvers             ▼
                        ▼                ┌─────────────────────────┐
                 ┌─────────────┐         │ stripe-webhook-handler  │
                 │  DynamoDB   │◀────────┤ (writes OrgSubscription)│
                 │  + streams  │         └─────────────────────────┘
                 └──────┬──────┘
                        │ NEW_AND_OLD_IMAGES
        ┌───────────────┼──────────────────────────┐
        ▼               ▼                          ▼
  event-logger   organization-trigger   newsletter-subscriber-trigger
   (→ EventLog)   (seed new tenants)     (confirm/welcome email via SES)

   S3 (uploads/) ──▶ s3-file-trigger ──▶ AppSync mutation (validation status)
   SES bounces  ──▶ SNS topic ──▶ ses-webhook-handler ──▶ subscriber status
```

### 5.1 Frontend composition

`app/layout.tsx` nests four providers, and the order matters:

```
ThemeProvider (next-themes, pinned to light)
  └─ AmplifyProvider   ← calls Amplify.configure(amplify_outputs.json) at module scope
       └─ AuthProvider      ← Cognito session, groups, auth-modal state
            └─ EarlyAccessProvider  ← newsletter modal state
```

`AmplifyProvider` imports `amplify_outputs.json` **at module scope**. That
file is generated, not committed — so a fresh clone will not build until you
have run a sandbox. This is deliberate: no environment's backend identity is
ever baked into the repo.

`AuthProvider` exposes `useAuth()`: `user` (email, userId, `groups` read from
the ID token's `cognito:groups` claim), `isAuthenticated`, and the modal
controls used by `Navbar` and `AuthModal`.

### 5.2 API surface and authorization

There is one API: **AppSync GraphQL**, generated from
`amplify/data/resource.ts`. Two auth modes are in play:

- `userPool` (default) — signed-in users. Every model's rules are expressed
  against the three Cognito groups: **Admin** (full CRUD), **Member**
  (working set), **Viewer** (read).
- `apiKey` — used by exactly one path: anonymous newsletter signup
  (`NewsletterSubscriber.create`) from `EarlyAccessModal`. The key expires in
  365 days and must be rotated.

Lambdas do not use the API key. They call AppSync with **SigV4-signed IAM
requests** (see the `graphql()` helper in
`amplify/functions/create-checkout-session/handler.ts` — that is the pattern
the other handlers should copy), authorized by the
`allow.resource(fn).to(['query','mutate'])` grants at the bottom of the
schema.

Group names live in **two** places that must stay in sync:
`amplify/shared/constants.ts` (authoritative, used by auth + the
post-confirmation trigger) and `siteConfig.auth.groups` in `config/site.ts`
(frontend mirror).

### 5.3 Data model

Foundation models, all in `amplify/data/resource.ts`:

| Model | Role | Written by |
|---|---|---|
| `Organization` | tenant root; holds `stripeCustomerId` | app (Admin) |
| `User` | Cognito user mirror; `orgId` links to tenant | post-confirmation Lambda, then onboarding |
| `Site` | optional sub-tenant location | app |
| `EventLog` | append-only audit trail | `event-logger` Lambda only (read-only to everyone) |
| `NewsletterSubscriber` | marketing list + lifecycle status | public API key create, then triggers |
| `OrgSubscription` | mirror of the Stripe subscription | `stripe-webhook-handler` only |
| `StripeWebhookEvent` | webhook idempotency + processing log | `stripe-webhook-handler` only |

Conventions you should follow when adding models (full detail in
[`docs/core-data-model.md`](core-data-model.md)):

- **Tenancy:** every model carries `orgId: a.id().required()` plus
  `belongsTo('Organization','orgId')`. Site-scoped models add optional `siteId`.
- **Indexes:** one GSI per access pattern, named `<models>By<Dimension>`.
- **`sortDate`:** a required `datetime` used as the sort key on chronological
  GSIs, so listings are ordered without a scan.
- **Computed keys:** e.g. `EventLog.entityKey` = `` `${entityType}#${entityId}` ``,
  set by the writer Lambda so one GSI serves "history for this record".

### 5.4 Billing flow

```
/subscribe  ──1──▶ User.usersByCognitoSub → orgId
            ──2──▶ createCheckoutSession(tier, orgId)   [GraphQL mutation]
                        │
                        ├─ resolves Organization, creates a Stripe Customer
                        │  if missing and writes stripeCustomerId back
                        └─ creates an embedded Checkout Session
            ◀──3──  { clientSecret }
            ──4──▶ <EmbeddedCheckout> renders in-page; Stripe returns to
                   /subscribe/success?session_id=...
                        │
Stripe ─────5────▶ Function URL → stripe-webhook-handler
                        └─ (TODO) verify signature, dedupe via
                           StripeWebhookEvent, upsert OrgSubscription
```

Tier IDs (`CORE` / `GROWTH` / `SCALE`) are the join key across three places:
the `SubscriptionTier` enum in the schema, the `STRIPE_PRICE_*` secrets, and
`config/pricing.ts`. `TRIAL` exists in the enum but is not purchasable.

Entitlement philosophy: gate on **scale** (`TIER_LIMITS.maxUsers`,
`maxSites`, your own countables), never on capability — every tier gets every
feature. Enforcement is not built yet.

### 5.5 Event-driven backend

`amplify/backend.ts` holds a single map, `streamEventSources`, that is the
source of truth for "which table streams into which Lambdas". Enabling the
stream and creating the `EventSourceMapping` are both derived from it:

```ts
const streamEventSources: Record<string, lambda.IFunction[]> = {
  Organization:         [eventLogger, organizationTrigger],
  User:                 [eventLogger],
  Site:                 [eventLogger],
  OrgSubscription:      [eventLogger],
  NewsletterSubscriber: [eventLogger, newsletterSubscriberTrigger],
};
```

Add your vertical's tables here (usually at least the event-logger, so the
model lands in the audit trail).

### 5.6 Why `backend.ts` looks the way it does

One CloudFormation constraint shapes all of the custom wiring:

> `Nested stack 'function' cannot depend on a parent stack.`

`allow.resource(fn)` in the schema creates a **data → function** dependency.
Any wiring that passes data/storage/parent-stack tokens *into* function-stack
resources completes a cycle CloudFormation rejects. Hence:

1. Custom resources are scoped to the **data stack**
   (`Stack.of(backend.data.resources.graphqlApi)`), not `backend.stack`.
2. IAM policies use **wildcard ARN strings**, never cross-stack tokens.
3. Stream ARNs are looked up **at deploy time** via an `AwsCustomResource`
   calling `DynamoDB.describeTable` — Amplify's `Custom::AmplifyDynamoDBTable`
   doesn't expose `StreamArn`.
4. S3 notifications are set with `putBucketNotificationConfiguration` through
   an `AwsCustomResource` plus an explicit `CfnPermission`, because
   `bucket.addEventNotification()` creates a data↔storage cycle.
5. Env vars carrying data/storage tokens (`GRAPHQL_ENDPOINT`,
   `STORAGE_BUCKET_NAME`) are safe **only** because those functions declare
   `resourceGroupName: 'data'`.
6. The post-confirmation trigger (auth stack) never references data-stack
   resources — it finds the `User` table at runtime via `ListTables` with a
   name-prefix match.

Follow these rules for any new wiring or the deploy fails with the error
above. Full write-up: [`CDK_WIRING_DEPLOY.md`](../CDK_WIRING_DEPLOY.md).

---

## 6. The Lambdas, and what actually runs

All functions use the Node 22 runtime and (except post-confirmation) sit in
the `data` resource group.

| Function | Trigger | State |
|---|---|---|
| `post-confirmation` | Cognito post-confirmation | **Implemented** — writes a `User` row (no org yet) and adds the user to the default group (`Viewer`) |
| `create-checkout-session` | AppSync mutation | **Implemented** — resolves the org, creates the Stripe customer if needed, returns an embedded-checkout `clientSecret` |
| `stripe-webhook-handler` | Lambda Function URL | **Stubbed** — returns 200; signature verification, idempotency, and `OrgSubscription` upserts are TODO |
| `event-logger` | DynamoDB streams (all mapped tables) | **Stubbed** — logs the record shape; does not write `EventLog` |
| `organization-trigger` | `Organization` INSERT | **Stubbed** — iterates `verticalOrgSeeds` and logs what it would create |
| `newsletter-subscriber-trigger` | `NewsletterSubscriber` stream | **Stubbed** — no token generation, no SES send |
| `s3-file-trigger` | S3 `uploads/` ObjectCreated | **Implemented** — HEAD + allowlist/size policy (`ingest.ts`), one streaming pass for SHA-256 + EXIF, then the vertical seam `amplify/data/media-ingest.ts` writes the owning record over IAM (foundation default: log only) |
| `ses-webhook-handler` | SNS (SES bounce/complaint) | **Partially implemented** — parses notifications; DB updates are TODO |

**This is the single most important thing to know when testing:** the stubs
are fully wired in CloudFormation. Streams fire, the webhook URL responds
200, S3 events arrive — and nothing is persisted. Do not read "the wiring
deployed" as "the behavior works."

---

## 7. First run

```bash
npm install

# Provisions your personal cloud sandbox and writes amplify_outputs.json.
# First run also performs the CDK bootstrap for the account/region.
npx ampx sandbox --profile <aws-profile>

# Backend secrets (repeat per secret):
npx ampx sandbox secret set STRIPE_SECRET_KEY
npx ampx sandbox secret set STRIPE_PRICE_CORE
npx ampx sandbox secret set STRIPE_PRICE_GROWTH
npx ampx sandbox secret set STRIPE_PRICE_SCALE
npx ampx sandbox secret set STRIPE_WEBHOOK_SECRET   # after §8 step 1

# Frontend env:
echo 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...' > .env.local

# In a second terminal (leave the sandbox running — it watches and redeploys):
npm run dev
```

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.
Tear down with `npx ampx sandbox delete`.

---

## 8. Post-deploy steps (per environment)

These cannot be automated because external services need values that only
exist after a deploy.

1. **Stripe webhook.** Read the `StripeWebhookUrl` CloudFormation output →
   create the webhook endpoint in the Stripe dashboard (that mode's
   dashboard) → copy the signing secret → set `STRIPE_WEBHOOK_SECRET` →
   redeploy. Each environment has its own Function URL and therefore its own
   signing secret.
2. **SES notifications.** Read the `SESNotificationTopicArn` output → set it
   as the bounce/complaint destination on your SES identity.
3. **SES domain.** Verify the sending domain and request production access —
   every fresh account starts sandboxed to verified recipients.

---

## 9. Environments and deployment

| Environment | AWS account | Git ref | Backend deploy |
|---|---|---|---|
| Developer sandbox | your dev account | working tree | `npx ampx sandbox` (personal, ephemeral) |
| Staging | staging account | `staging` branch | Amplify Hosting app in that account |
| Production | production account | `main` branch | Amplify Hosting app in that account |

Amplify Hosting detects the Gen 2 backend and runs the equivalent of
`npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID` during
the build. Per app/branch, configure in the console: `APP_URL` (read at synth
time by `backend.ts`), the Stripe secrets (test mode in staging, live in
production), and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

There is no deploy ordering to manage inside the backend — the
CloudFormation graph is acyclic by construction. Deploy everything at once;
the only sequencing is §8.

---

## 10. Launching a product: the configuration contract

Everything product-specific lives in five places. Foundation code reads from
them and holds no product facts.

| Layer | Where | What you change |
|---|---|---|
| Identity, nav, SEO | `config/site.ts` (incl. `ogTheme`) | product/company names, tagline, base URL, keywords, nav links, blog author |
| Palette & assets | `config/theme.css` + `public/` | raw palette → semantic tokens; logo/favicon set. **Mirror palette changes into `ogTheme`** — OG image generation runs at the edge and cannot read CSS variables |
| Tiers & limits | `config/pricing.ts` | display names/prices/features and `TIER_LIMITS` |
| Env & secrets | `.env.local` + Amplify secrets/console | Stripe keys and prices, `APP_URL` |
| Domain models & seeds | `amplify/data/vertical.ts` + `streamEventSources` in `backend.ts` | your models, entity types, event actions, per-org seed records |

### 10.1 Adding a vertical model

`amplify/data/vertical.ts` exports four things that get merged into the
foundation schema — `resource.ts` should not need editing:

```ts
export const verticalModels = { /* your a.model(...) definitions */ };
export const verticalEntityTypes: string[] = [];   // → EntityType enum
export const verticalEventActions: string[] = [];  // → EventAction enum
export const verticalOrgSeeds: Array<Record<string, unknown>> = []; // → organization-trigger
```

The full checklist for a new model:

1. Define it in `verticalModels` with `orgId`, `sortDate`, a `belongsTo`
   relation, GSIs, and group-based authorization.
2. Add its entity type to `verticalEntityTypes` and any new actions to
   `verticalEventActions`.
3. Add the table to `streamEventSources` in `amplify/backend.ts` (at minimum
   `[eventLogger]`) so it lands in the audit trail.
4. If it owns files, use the `uploads/` prefix and the
   `FileValidationStatus` enum so the S3 pipeline applies.

### 10.2 Adding a scheduled job

Create an EventBridge `Rule` **in the data stack** targeting your Lambda —
`backend.ts` has a commented example at the end of section #6.

---

## 11. Storage layout

`amplify/storage/resource.ts` defines three prefixes, all authenticated:

| Prefix | Purpose | Triggered |
|---|---|---|
| `uploads/{entity_id}/*` | user documents | yes — `s3-file-trigger` validation pipeline |
| `exports/{entity_id}/*` | generated artifacts | no |
| `logos/{entity_id}/*` | organization logos | no |

`s3-file-trigger` parses keys as `uploads/{entityId}/{fileName…}` (the
vertical decides what the entity segment means), skips anything not under
`uploads/`, applies the content-type / size allowlist in
`amplify/functions/s3-file-trigger/ingest.ts`, streams the object once for
a SHA-256 (plus EXIF from the first 2 MiB of images), and hands the
`IngestResult` to `amplify/data/media-ingest.ts`. That seam is
downstream-owned: it reads the uploader's `x-amz-meta-media-id` metadata
to find the owning row and writes the server-only columns (`sha256`,
`fileValidationStatus`, EXIF) over the Lambda's IAM grant — columns whose
field rules grant no client group a write (`docs/core-data-model.md`
§2.5). The seam may answer `retry` when the row isn't there yet (clients
create it right after the upload completes); the trigger waits, then
throws so Lambda's async retry finishes the job. Originals are never
modified or moved: an INVALID verdict lives on the row, not the object.
New prefixes must be added **both** to `storage/resource.ts` and to
`validatedUploadPrefixes` in `backend.ts` if they should be validated.

---

## 12. Theming

`config/theme.css` holds a raw palette plus shadcn/ui semantic tokens;
`app/globals.css` exposes those tokens as Tailwind utilities. Write markup
against **semantic** utilities (`bg-primary`, `text-muted-foreground`) — the
raw palette is meant to be a private implementation detail of `theme.css`.
Some legacy brand-named variables (`--navy`, `--emerald`) remain from the
original product and are being swept out.

Dark mode is implemented (class-based, via next-themes) but **pinned to
light** in `app/components/ThemeProvider.tsx` until the dark palette gets a
visual QA pass and the app shell ships a toggle.

---

## 13. Known gotchas

- **Fresh clones don't build.** `AmplifyProvider` imports
  `amplify_outputs.json` at module scope; run `ampx sandbox` first.
- **Stubbed Lambdas look wired but do nothing** (see §6).
- **New AWS accounts are in the SES sandbox** — email only reaches verified
  recipients until you request production access.
- **The AppSync API key expires after 365 days.** It backs anonymous
  newsletter signup; rotate it.
- **`ogTheme` in `config/site.ts` duplicates theme colors** and must be
  updated by hand when the palette changes.
- **Group names are duplicated** in `amplify/shared/constants.ts` and
  `config/site.ts`; the backend file is authoritative.
- **Sign-up creates a `User` with no `orgId`** until onboarding completes,
  which is why `/subscribe` says "complete onboarding first." The `(app)`
  route group gates on it (`app/(app)/layout.tsx` → `AppGate`).
- **You cannot unlock an add-on module in a fresh sandbox without an
  Operator.** `OrgEntitlementOverride` is the only non-Stripe path to an
  add-on, and only the `Operator` Cognito group may write it. If
  `aws cognito-idp admin-add-user-to-group` is denied, that is your own
  permission set, not the pool: the AWS managed policy
  `AmplifyBackendDeployFullAccess` grants no `cognito-idp` actions at all.
  Either add `cognito-idp:AdminAddUserToGroup` on the sandbox pool to your
  role (preferred), or drop your username into the gitignored
  `amplify/.sandbox-operators` and redeploy — see
  `docs/onboarding-and-permissions.md` → Operator. Sign out and back in
  afterwards to pick up the group claim.

---

## 14. Where to read next

| Document | Covers |
|---|---|
| [`docs/ROADMAP.md`](ROADMAP.md) | current state, ordered roadmap, open decisions |
| [`docs/architecture.md`](architecture.md) | system design, planned API surfaces (REST, MCP, copilot) |
| [`docs/core-data-model.md`](core-data-model.md) | model-by-model reference and schema conventions |
| [`docs/subscriptions-and-payments.md`](subscriptions-and-payments.md) | billing + entitlements design |
| [`docs/onboarding-and-permissions.md`](onboarding-and-permissions.md) | org creation and role model |
| [`docs/design-system.md`](design-system.md) | tokens, typography, component conventions |
| [`CDK_WIRING_DEPLOY.md`](../CDK_WIRING_DEPLOY.md) | the circular-dependency patterns in `backend.ts` |
| [`SES_CONFIGURATION.md`](../SES_CONFIGURATION.md) | domain verification, SPF/DMARC, templates, bounce handling |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | how product repos mirror this foundation and contribute back |
| [`docs/playbooks/`](playbooks/) | brand, landing page, MVP, dataviz, compliance playbooks |
