# Foundation Roadmap

What's built, what's ahead, and the decisions still open. For how work flows
between this foundation and product repos, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Where the foundation stands

**Working today**
- Marketing site: config-driven landing sections, MDX blog, SEO machinery
  (sitemap, robots, OG images, JSON-LD), early-access/newsletter capture
- Auth: Cognito email sign-in/up/confirm/reset via modal; post-confirmation
  provisioning (User record + default group)
- Billing (front half): Stripe embedded checkout end-to-end — plan selection
  from `config/pricing.ts`, checkout-session Lambda, customer creation
- Data layer: multi-tenant core schema (`Organization`/`User`/`Site`/
  `EventLog`/`OrgSubscription`/`StripeWebhookEvent`/`NewsletterSubscriber`)
  with the vertical seam in `amplify/data/vertical.ts`
- Infra wiring: DynamoDB streams → Lambda mappings, S3 upload notifications,
  SES bounce/complaint SNS topic, Stripe webhook Function URL (see
  `CDK_WIRING_DEPLOY.md` for the patterns)
- Theming: semantic tokens only, one-file re-theme (`config/theme.css`),
  designed dark palette (pinned to light pending QA)
- Landing: all copy and section order in `config/landing.ts`; module
  showcase, `/modules/[id]` pages and pricing add-on strip render from the
  module registry (`config/modules.ts`, `docs/modules.md`)
- App shell: `(app)` route group with auth/onboarding gate, sidebar built
  from the module registry, `EntitlementsProvider` (org, tier, status,
  entitled modules), `ModuleShell` per-module gate with upsell state,
  dashboard, org + billing settings pages
- Onboarding: `/onboarding` → `createOrganization` mutation (Lambda creates
  the org, links the User, elevates the creator to Admin)

**Wired but stubbed** — the Lambdas exist and are connected, their bodies are
TODOs: `stripe-webhook-handler`, `event-logger`, `organization-trigger` seed
execution, `s3-file-trigger` validation, `newsletter-subscriber-trigger`,
`ses-webhook-handler` DB updates.

**Missing entirely** — backend entitlement enforcement (scale limits on
create paths), customer portal, member invites, legal pages.

## First deploy: AWS account bootstrap

Per product (or per product-environment), before the first `ampx sandbox`:

1. Create the account inside an **AWS Organization** (management account +
   member account per product) — adding accounts later is trivial, migrating
   standalone ones is not
2. IAM Identity Center (SSO) + `aws configure sso` → named CLI profile
3. Pick and record a region (Amplify, SES, and webhooks all live there)
4. `npx ampx sandbox --profile <profile>` — first run performs the CDK
   bootstrap and generates `amplify_outputs.json`
5. Secrets via `npx ampx sandbox secret set`: `STRIPE_SECRET_KEY`,
   `STRIPE_PRICE_CORE|GROWTH|SCALE`, `STRIPE_WEBHOOK_SECRET` (create the
   Stripe test-mode products/prices first); frontend key in `.env.local`
6. Amplify Hosting: connect the repo, branch-based envs, per-branch secrets
7. SES: verify the sending domain and request production access early — new
   accounts are sandboxed to verified recipients (see `SES_CONFIGURATION.md`)
8. Guardrails: AWS Budgets alert, CloudTrail on, MFA on root

## Deployment model

Three environment kinds, each in its own AWS account:

| Environment | AWS account | Git ref | Backend deploy |
|---|---|---|---|
| Developer sandbox | your dev account | working tree | `npx ampx sandbox` (personal, ephemeral) |
| Staging | dedicated staging account | `staging` branch | Amplify Hosting app in that account |
| Production | client production account | `main` branch | Amplify Hosting app in that account |

There is no deploy-time ordering to manage inside the backend — the
CloudFormation graph is acyclic by construction (see `CDK_WIRING_DEPLOY.md`).
Deploy everything at once; the only sequencing lives in the post-deploy
steps below, where external services need deploy outputs.

### Sandbox (development / first validation)

```bash
npx ampx sandbox --profile <dev-profile>      # full deploy + watch mode;
                                              # writes amplify_outputs.json
npx ampx sandbox secret set STRIPE_SECRET_KEY # repeat for STRIPE_PRICE_CORE|GROWTH|SCALE,
                                              #   STRIPE_WEBHOOK_SECRET
npx ampx sandbox delete                       # tear down when done
```

Run a sandbox from the foundation repo after any wiring change — it
exercises the complete synth + deploy in minutes and is the cheap proof
before product repos inherit the change.

### Staging / production (Amplify Hosting per account)

In each account's Amplify console: create an app connected to the product
repo, tracking that environment's branch. Amplify Hosting detects the Gen 2
backend and runs the equivalent of:

```bash
npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
```

during the build (add an `amplify.yml` only if you need to customize the
build). Per app/branch, configure in the console:

- **Environment variables:** `APP_URL` (the environment's public origin) —
  read at synth time by `amplify/backend.ts`
- **Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET`
  — Stripe **test-mode** keys/prices in staging, **live** in production
- **Frontend env:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test vs live to
  match)

### Post-deploy steps (per environment — this is the real ordering)

1. Read the `StripeWebhookUrl` CloudFormation output → create the webhook
   endpoint in the Stripe dashboard (that mode's dashboard) → copy the
   signing secret → set `STRIPE_WEBHOOK_SECRET` → redeploy. Each
   environment has its own Function URL, hence its own signing secret.
2. Read the `SESNotificationTopicArn` output → set it as the SES
   bounce/complaint notification destination.
3. SES per account: verify the sending domain and request production access
   (every fresh account starts sandboxed to verified recipients).

### Amplify files: tracked vs generated

| Path | Git status | Why |
|---|---|---|
| `amplify/**` (resources, functions, `backend.ts`) | **tracked** | the backend's source of truth |
| `amplify/functions/*/package.json` + lockfiles | **tracked** | per-function dependency pins |
| `amplify_outputs.json` | **gitignored** | generated per environment (sandbox writes it locally; Hosting generates it in the build). Contains environment-specific endpoints/pool IDs — committing one environment's file would silently point other environments (or another developer's sandbox) at the wrong backend |
| `.amplify/` | **gitignored** | CDK synth artifacts, fully regenerated |
| `amplifyconfiguration*` | **gitignored** | legacy Gen 1 name, same rule as outputs |
| `.env.local` / `.env*` | **gitignored** | local frontend env (publishable key); per-environment values live in the Amplify console |

Consequence of the gitignored outputs file: a fresh clone doesn't build
until `ampx sandbox` (or a downloaded outputs file for a deployed env)
provides `amplify_outputs.json` — `AmplifyProvider` imports it at module
scope. This is deliberate: no environment's backend identity is ever baked
into the repo.

## Roadmap

Ordered by dependency; each item leaves the repo deployable.

### 1. Billing completion & entitlements (largest item)
Implements `docs/subscriptions-and-payments.md`:
- Stripe webhook handler: signature verification, idempotency via the
  `StripeWebhookEvent` GSI, handlers for checkout/subscription/invoice
  events → upsert `OrgSubscription`
- Entitlement enforcement from `TIER_LIMITS` in `config/pricing.ts` —
  gate on scale (users/sites/vertical countables), never capability;
  ACTIVE/TRIALING/PAST_DUE all grant access
- `SubscriptionProvider` client context (`org`, `tier`, `status`,
  `isActive`, `needsOnboarding`, `needsSubscription`)
- Backend enforcement on create paths; customer-portal session mutation +
  billing page; server-side verification on `/subscribe/success`; PAST_DUE
  banner

### 2. App shell & protected routes (shell + onboarding shipped)
- Remaining: member invites (`/settings` roster is read-only), org switcher
  for multi-org users, `(marketing)` route group move, `(auth)` pages
- Recharts per `docs/playbooks/dashboards-dataviz.md`
- Dark mode: visual QA of the dark palette, theme toggle, then unpin
  `ThemeProvider` (`defaultTheme="system"`, `enableSystem`)

### 3. Event-driven backend completion
- `event-logger`: generic stream → `EventLog` audit-trail writer
- `newsletter-subscriber-trigger` (SES confirm/welcome) +
  `ses-webhook-handler` DB updates (bounce/complaint → subscriber status)
- `s3-file-trigger`: metadata + SHA-256 hash, validation status write-back
- Document the vertical trigger-authoring pattern (function +
  `streamEventSources` entry + IAM)

### 4. Config-driven landing (shipped except the hero slot)
- Pluggable hero-visual slot (default products to a lighter static visual
  than the three.js scene)

### 5. Legal & SEO completeness
- Privacy Policy + Terms templates with company identity injected from
  `config/site.ts` (footer already links `/privacy` and `/terms`)
- Per-product SEO launch checklist (domain, OG validation, search console)

### 6. Launch workflow
- `docs/NEW_PRODUCT.md`: the definitive spin-up checklist (mirror repo →
  edit `config/*` → swap assets → secrets → vertical schema → deploy)
- Optional `scripts/init-product.ts` interactive scaffolder

## The configuration contract

Everything a product changes lives in five places; foundation code reads
from them and contains no product facts:

| Layer | Location |
|---|---|
| Identity, nav, SEO | `config/site.ts` (+ `ogTheme`) |
| Palette & dark mode | `config/theme.css` + `public/` assets |
| Tiers & limits | `config/pricing.ts` |
| Env / secrets | `.env.local` + Amplify secrets / console env |
| Landing copy & section order | `config/landing.ts` |
| Modules (products within the product) | `config/modules.ts` + `modules/<id>/` (see `docs/modules.md`) |
| Domain models & seeds | `amplify/data/vertical.ts` (+ `streamEventSources` in `backend.ts`) |

## Open decisions

| Decision | Leaning |
|---|---|
| Auth UX: modal-only vs. `(auth)` pages | Add `/login`,`/signup` pages (deep-linkable, redirect targets); keep the modal for marketing conversion |
| Middleware vs. layout gating | Layout-level gates (fits Amplify SSR tokens); middleware optional later |
| Three.js hero visual | Make it a pluggable slot; heavy dependency for a default |
| Package extraction / monorepo | Revisit only after 2–3 products prove the stable seams |

## Known gotchas

- `app/components/AmplifyProvider.tsx` imports `amplify_outputs.json` at
  module scope — fresh clones don't build until `ampx sandbox` runs
- New AWS accounts start in the SES sandbox (verified recipients only)
- The AppSync API key mode (newsletter create) expires in 365 days — rotate
- Stubbed Lambdas look wired in CDK but do nothing — don't mistake wiring
  for behavior when testing
- Dark mode is pinned to light in `ThemeProvider` until QA'd
