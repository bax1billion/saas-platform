# SaaS Platform Foundation

A white-label foundation for launching SaaS products. Clone it, configure the brand, define the vertical's data models, and deploy.

**Status:** foundation core in place (config layer, semantic theming, generic multi-tenant schema, Stripe checkout); entitlements, app shell, and the backend Lambda bodies are the active roadmap — see [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

- **Frontend:** Next.js (App Router) · React · Tailwind CSS v4 · shadcn/ui · MDX blog
- **Backend:** AWS Amplify Gen 2 — Cognito auth, AppSync GraphQL, DynamoDB (stream-triggered Lambdas), S3, SES, EventBridge
- **Billing:** Stripe embedded checkout, webhook-driven subscription state, tier-based entitlements
- **Tenancy:** `Organization` / `User` / `Site` multi-tenant core data model with an `EventLog` audit trail

## First run

> **Prerequisite:** an AWS account with a configured CLI profile — see the AWS bootstrap checklist in [`docs/ROADMAP.md`](docs/ROADMAP.md).

```bash
npm install

# Start a personal cloud sandbox — provisions the backend and generates
# amplify_outputs.json (gitignored). The frontend will NOT build without it:
# app/components/AmplifyProvider.tsx imports amplify_outputs.json at module scope.
npx ampx sandbox --profile <aws-profile>

# In another terminal:
npm run dev
```

### Secrets

Set via `npx ampx sandbox secret set <NAME>` (see `.env.local` for the frontend key):

| Secret | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | checkout + webhook Lambdas |
| `STRIPE_PRICE_CORE` / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` | checkout session creation |
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env.local` (frontend) |

## Repo layout

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router — marketing site, blog, subscribe flow |
| `amplify/` | Amplify Gen 2 backend: auth, data schema, storage, 12 functions, custom CDK wiring (`backend.ts`) |
| `components/ui/` | shadcn/ui primitives |
| `config/` | the white-label switchboard: site identity, theme, pricing, landing copy, module registry |
| `modules/` | one directory per module (product within the product) — see `docs/modules.md` |
| `content/blog/` | MDX blog posts |
| `docs/` | Architecture and design docs; `docs/playbooks/` holds reusable launch playbooks (brand, landing page, MVP, compliance readiness) |
| `lib/` | Shared utilities |

## Key documents

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — current state, roadmap, configuration contract, open decisions
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how product repos mirror this foundation and contribute back
- [`docs/architecture.md`](docs/architecture.md) — system architecture
- [`docs/core-data-model.md`](docs/core-data-model.md) — foundation data model and schema conventions
- [`docs/subscriptions-and-payments.md`](docs/subscriptions-and-payments.md) — billing + entitlements design
- [`docs/modules.md`](docs/modules.md) — the module pattern: registry, app shell, entitlements, add-on billing
- [`CDK_WIRING_DEPLOY.md`](CDK_WIRING_DEPLOY.md) — how the custom CDK wiring avoids Amplify circular-dependency pitfalls
