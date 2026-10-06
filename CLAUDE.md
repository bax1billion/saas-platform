# CLAUDE.md

Guidance for Claude Code sessions in this repo. Read it before making changes.

## What this is

A white-label, multi-tenant SaaS foundation: Next.js front end, AWS Amplify Gen 2
backend, Stripe billing, sold as a lineup of **modules** (products inside the product).
Products are private mirrors of this repo. Foundation code holds no product facts; a
product's specifics live behind seams (`config/`, `modules/`, `amplify/data/vertical.ts`,
`amplify/data/media-auth.ts`, `media-ingest.ts`, `export-providers.ts`, `assist-helpers.ts`).
`CONTRIBUTING.md` says how products and the foundation relate and what makes a good
upstream contribution: *would the next unrelated vertical use this unchanged?*

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4,
  shadcn/ui (`components/ui/`, new-york style, lucide icons), MDX, sonner toasts.
- **Backend:** AWS Amplify Gen 2: Cognito, AppSync GraphQL, DynamoDB (+ streams to Lambda),
  S3, SES, EventBridge, CloudFront media CDN, Bedrock (Assist). Custom CDK wiring in
  `amplify/backend.ts`.
- **Billing:** Stripe embedded checkout + webhook Lambda mirroring into `OrgSubscription`.
- **Tests:** Vitest (node env, no globals). **Node 22** (`.nvmrc`, CI, Lambda runtime). npm only.

## Layout

| Path | What lives there |
|---|---|
| `app/` | public pages (landing, blog, `modules/[id]`) and the signed-in app under `app/(app)/`; **thin** route files only. `(app)/layout.tsx` is the auth/onboarding gate |
| `app/components/` | providers (Amplify, Auth, Entitlements, Theme), `AppShell`, `ModuleShell`, `ModulePreviewHome`, `FlagIt`, `AssistSuggestion`, landing sections |
| `modules/<id>/` | a module's `module.ts` (client-safe `ModuleDef`), `components/` (real UI), `lib/` (pure logic + tests). Downstream-owned |
| `config/` | product switchboard: `site.ts`, `modules.ts` (registry), `pricing.ts`, `landing.ts`, `theme.css`. Downstream-owned; the foundation ships neutral defaults |
| `amplify/data/resource.ts` | foundation schema (Organization/User/Site/EventLog/billing/TesterFlag/AssistEvent/ExportJob) |
| `amplify/data/vertical.ts` | the product seam: composes every module schema from `amplify/data/modules/<id>.ts`, plus `verticalRecordAccess` and `applyVerticalBackend` for product CDK wiring |
| `amplify/data/{entitlements,record-access}/` | APPSYNC_JS pipeline steps (`.js`) + their tests |
| `amplify/functions/<name>/` | Lambdas (`resource.ts` + `handler.ts`); some have their own `package.json` |
| `amplify/custom/<name>/` | Raw CDK constructs for what `defineFunction` cannot package (the media CDN's sharp transform, the export renderer's react-pdf): a `NodejsFunction` with an install hook, wired by hand in `backend.ts` |
| `amplify/data/assist-helpers.ts` | Product seam for Assist: one helper per job (`amplify/shared/assist/types.ts`), run by `assistRun`; `docs/spine-services-design.md` § 2 |
| `amplify/data/export-providers.ts` | Product seam for the export service: one provider per record type builds the document model (`lib/export/model.ts`); `docs/spine-services-design.md` § 3 |
| `lib/` | shared utils (`cn()`, `getDataClient()`, module entitlement logic, `roles.ts`, `time/` zone-aware clock and ISO-date math used by client and Lambdas, `export/`, `assist/`) |
| `scripts/` | check scripts (`check-backend`, `check-cfn-cycles`, `check-resolvers`) |
| `docs/` | design docs and playbooks |

Path alias `@/*` maps to the repo root, **except inside `amplify/`** (see Gotchas).

## Commands

```bash
npm ci                         # install
npm run dev                    # Next dev server; needs amplify_outputs.json (see Gotchas)
npm test                       # vitest run, all colocated *.test.ts
npx vitest run path/to/file.test.ts      # single file;  add -t "name" for one test
npx tsc --noEmit               # root typecheck
npx tsc --noEmit -p amplify/tsconfig.json  # backend typecheck exactly as ampx deploy runs it
npm run lint                   # eslint (next core-web-vitals + typescript)
npm run check:backend          # full local CDK synth + CFN cycle scan, no AWS creds (~40s)
npm run check:entitlements     # entitlement decision-table tests
npm run check:resolvers -- --profile <aws-profile>  # validate APPSYNC_JS via AppSync (needs AWS creds)
npx next build                 # production build
```

**CI** (`.github/workflows/ci.yml`, every PR and push to `main`): `npm ci`, stub
`amplify_outputs.json` with `{}`, `npm test`, `npx tsc --noEmit`,
`npx eslint . --max-warnings=0`, `npm run check:backend`. Lint runs on the **whole repo at zero
warnings** and includes the module import boundaries (below), so a single new warning fails the PR.

For local checks without a sandbox: `test -f amplify_outputs.json || echo '{}' > amplify_outputs.json`
(it is gitignored; never commit it). Real runs need `npx ampx sandbox --profile <profile>`.

## Architecture essentials

- **Tenancy:** every model carries `orgId: a.id().required()` + an `...ByOrg` GSI. Module
  models must **not** `belongsTo('Organization')` (synth fails). GSIs are named
  `<models>By<Dimension>`; chronological ones sort on `sortDate`. Details: `docs/core-data-model.md`.
- **Roles:** Cognito groups `Operator` / `Admin` / `Member` / `Viewer` (`amplify/shared/constants.ts`
  is authoritative; `config/site.ts` mirrors it). Operator has zero standing access to org data;
  it only writes `OrgEntitlementOverride`. New sign-ups are `Viewer` with no `orgId` until onboarding.
  `lib/roles.ts` answers who manages the org and who may write.
- **Entitlements:** client decision in `lib/modules/index.ts` (`useEntitlements().hasModule`);
  server enforcement is APPSYNC_JS steps in `amplify/data/entitlements/` on every mutation of
  tables in `verticalModuleTables` and on `verticalModuleMutations`. Forgetting either leaves an
  ungated side door into a paid module. Selling is gated twice: `stage` in the registry (client)
  and `amplify/data/sellable.ts` (the checkout Lambda refuses any other id).
- **Record access:** per-record view/edit policies (`amplify/data/record-access/`,
  `docs/record-access.md`). Unauthorized reads return null; writes fail with `RecordAccessDenied`.
- **Server-authoritative writes:** default is *client writes, field-level auth makes server-owned
  columns write-to-nobody, a DynamoDB stream handler fills them* (idempotent; stream records carry
  no caller identity). Command mutations (`a.handler.function`) only when a request must be
  rejected before anything is written; they bypass model/field rules, so re-check `orgId` yourself.
  Read `docs/modules.md` -> "Backend business logic" and `docs/submit-then-verify.md` first.
- **Data access in UI:** `getDataClient()` from `@/lib/data-client`; org/role from
  `useEntitlements()` / `useAuth()`. Media reads go through the media CDN (`getMediaAccess`), never S3.
- **Custom CDK wiring:** follow `CDK_WIRING_DEPLOY.md`. Circular nested-stack dependencies are the
  most common deploy failure; APPSYNC_JS steps go in `Stack.of(dataSource)`, not `Stack.of(graphqlApi)`.
  Product-specific CDK goes in `applyVerticalBackend` (`amplify/data/vertical.ts`), never in `backend.ts`.
- **Adding a module:** follow `docs/adding-a-module.md` end to end (registry entry, theme token,
  schema file, `vertical.ts` composition, thin routes with `<ModuleShell>`, tests).
- **Module boundaries** (`docs/data-coupling.md`): one owning module per table, and nothing else
  writes it. `modules/<a>/` never imports from `modules/<b>/` (eslint fails the PR); a schema file
  never `a.ref`s / relates to another module's models (`lib/schema-boundaries.test.ts`); a module
  reads another's data only through its published contract and must work when that module is not
  licensed. Cross-module effects travel as events into the owner's stream handler.
- **Shared services** (`docs/spine-services-design.md`): Assist (Bedrock, dark until `ASSIST_MODE`
  is set) and document export (react-pdf renderer on the `ExportJob` stream). Products plug in
  through the two seams; nothing product-side builds its own.

## Conventions

- TypeScript strict; import from `vitest` explicitly. Tests are colocated `*.test.ts`, focused on
  pure logic (`modules/<id>/lib/`, resolver steps, parsers). Infra is validated by `check:backend`.
- `modules/<id>/lib/` stays free of DOM/Next imports. `module.ts` must never import schema files
  or `@aws-amplify/backend`.
- Module model names are prefixed (`WidgetRequest`, not `Request`); schema namespace is global.
- Styling: semantic Tailwind tokens (`bg-primary`, `text-muted-foreground`, `var(--module-accent)`).
  No hex literals outside `config/theme.css`; no brand-named utilities in new code. Group colours
  (`--group-<id>`) mark headers and chips only; never a product accent.
- Product strings come from `config/`, not hardcoded in foundation files.
- Line endings are LF (`.gitattributes`).
- **Commits:** `<area>: <imperative subject>`, e.g. `foundation: ...`, `docs: ...`, `fix: ...`.
  One concern per commit. Foundation code carries no product facts: no client names, domains,
  Stripe ids, AWS account ids, or org names in fixtures, tests or comments.

## How Claude works here

1. Branch from up-to-date `main` and target `main` with the PR; never commit to `main` directly.
2. Keep diffs focused on the request. Suggest unrelated fixes rather than bundling them.
3. Add or update tests for logic you change (`*.test.ts` next to the code).
4. Before pushing run what CI runs: `npm test`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`,
   `npm run check:backend`; plus `npx next build` for UI changes and
   `npx tsc --noEmit -p amplify/tsconfig.json` if you touched `amplify/`. Report anything you
   could not run. Nothing that only synth has seen counts as working: AppSync-JS limits and
   IAM-vs-Cognito caller assumptions pass synth and fail at run time, so say plainly when code has
   not been exercised against a sandbox.
5. Open a **draft** PR with a plain-language before/after summary and the checks you ran. Update
   the relevant `docs/` file when you add a capability or change a convention.
6. Never commit secrets, `.env*`, `amplify_outputs*`, `amplify/.sandbox-operators`, or real
   customer data. Secrets are set with `npx ampx sandbox secret set <NAME>`.
7. Do not deploy, run `ampx sandbox`, or touch Stripe/AWS resources unless explicitly asked.

## Gotchas

- `app/components/AmplifyProvider.tsx` imports `amplify_outputs.json` at module scope: without the
  file, `tsc` and `next build` fail. A `{}` stub (as CI uses) is enough for tests, typecheck and
  build; the running app needs a real one from `npx ampx sandbox`.
- Files under `amplify/` must import `modules/` code by **relative path**. `amplify/tsconfig.json`
  has no `@/` alias; root `tsc` passes but the Amplify deploy type-check fails.
- Module schema files must live under `amplify/` (ESM). Outside it they load as CommonJS and synth
  fails with "does not provide an export named ...".
- APPSYNC_JS (`amplify/data/**/*.js`) is a subset of JS: no `throw`, `try`, `while`, C-style `for`,
  regex literals, `++`, `Function.call/apply/bind`. Vitest will pass code AppSync rejects at deploy;
  `amplify/data/appsync-js.test.ts` is the static guard and `npm run check:resolvers` the real one.
- No `.default()` on field-auth read-only columns; defaults apply before field auth and break creates.
- Never send `id` on a create. Once any column on a model carries a field-level rule, the create
  resolver checks every input field against an explicit allowed list, and an undeclared `id` is not
  on it ("Unauthorized on [id]"); declaring `id` to allow it adds a pipeline function, and a gated
  model's mutations already sit at AppSync's limit of ten ("A resolver can only be composed of 10
  functions"). Create the row first and use the server's id afterwards.
- `MEDIA_CDN_PRIVATE_KEY` must exist as a secret in each environment or the deploy fails
  (placeholder fine). Module prices are one secret, `STRIPE_MODULE_PRICES` (JSON, module id to
  Stripe Price id), bound only in an environment that may sell a module (`sellableModules` or
  `NEXT_PUBLIC_MODULE_STAGES`), and it must exist there. Never bind one secret per module: a
  Lambda's environment is capped at 4 KB and the deploy fails at about a dozen.
- Some Lambdas are wired but still stubbed (`event-logger`, `organization-trigger`,
  `newsletter-subscriber-trigger`, `ses-webhook-handler` DB updates): wiring deploying
  does not mean behavior works. Parts of `docs/` predate current conventions; code wins over docs.
- A command Lambda called by another Lambda over IAM has no Cognito `sub`: `resolveCaller`-style
  helpers refuse it. Give such a path an explicit, narrowly scoped system caller rather than
  widening the user path.
- A signed-in user in a Cognito group assumes that **group's IAM role**, not the authenticated
  role. Any grant made only to `allow.authenticated` (storage) or `authenticatedUserIamRole`
  (custom constructs) reaches nobody in a group, which is every onboarded user. Grant the org
  groups too (`allow.groups([...])`; `backend.auth.resources.groups[g].role`), never Operator.
- Stale `.next/types` errors after switching branches: `rm -rf .next`.
- The Hosting build dies in "Running TypeScript" with "JavaScript heap out of memory" when the
  frontend type check outgrows Node's default heap (about 2 GiB on the Standard 8 GiB build box).
  Every schema file imports `@aws-amplify/backend`, which brings the CDK and SDK typings along.
  `.npmrc` sets `node-options=--max-old-space-size=4096` for every npm script, which Next's
  type-check worker inherits; a bigger build box does not change the default heap. Measure with
  `npx tsc --noEmit --incremental false --extendedDiagnostics`.
- Hosting stores environment variables on one line. A pasted PEM (`MEDIA_CDN_PUBLIC_KEY`) loses its
  line breaks and CloudFront rejects it ("empty/invalid/out of limits RSA Encoded Key");
  `amplify/custom/media-cdn/public-key.ts` repairs it at synth. Treat any multi-line value the same way.
- A raw `NodejsFunction` (`amplify/custom/`) has no `allow.resource` grant on the schema, so it cannot call
  AppSync as itself; it works through the table or the bucket with explicit grants in `backend.ts`.
  Reach for one only when `defineFunction` cannot bundle a dependency (native modules, packages with
  unresolved subpath imports such as `@react-pdf/renderer`).
