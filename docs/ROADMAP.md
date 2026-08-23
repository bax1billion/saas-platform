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

**Wired but stubbed** — the Lambdas exist and are connected, their bodies are
TODOs: `stripe-webhook-handler`, `event-logger`, `organization-trigger` seed
execution, `s3-file-trigger` validation, `newsletter-subscriber-trigger`,
`ses-webhook-handler` DB updates.

**Missing entirely** — entitlement enforcement, authenticated app shell,
customer portal, legal pages.

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

### 2. App shell & protected routes
- Route groups: `(marketing)` / `(app)` (+ `(auth)` pages — see decisions)
- `(app)/layout.tsx`: auth + subscription gates, shadcn sidebar shell
  (sidebar tokens exist), org switcher, user menu
- Onboarding: org creation (name → slug), `User.orgId` wiring, Admin
  elevation
- First real `components/ui/*` adoption; Recharts per
  `docs/playbooks/dashboards-dataviz.md`
- Dark mode: visual QA of the dark palette, theme toggle, then unpin
  `ThemeProvider` (`defaultTheme="system"`, `enableSystem`)

### 3. Event-driven backend completion
- `event-logger`: generic stream → `EventLog` audit-trail writer
- `newsletter-subscriber-trigger` (SES confirm/welcome) +
  `ses-webhook-handler` DB updates (bounce/complaint → subscriber status)
- `s3-file-trigger`: metadata + SHA-256 hash, validation status write-back
- Document the vertical trigger-authoring pattern (function +
  `streamEventSources` entry + IAM)

### 4. Config-driven landing
- `config/landing.tsx`: typed section content (hero, pains, features,
  social proof; pricing already pulls from `config/pricing.ts`)
- Composable section list (products pick sections and order)
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
