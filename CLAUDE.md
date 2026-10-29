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
| `app/components/` | providers (Amplify, Auth, Entitlements, Theme, Door), `AppShell` and the frame pieces in `shell/` (`docs/shell.md`), `ModuleShell`, `ModulePreviewHome`, `FlagIt`, `SyncPill`, `AssistSuggestion`, landing sections |
| `modules/<id>/` | a module's `module.ts` (client-safe `ModuleDef`), `components/` (real UI), `lib/` (pure logic + tests). Downstream-owned |
| `config/` | product switchboard: `site.ts`, `modules.ts` (registry), `pricing.ts`, `landing.ts`, `theme.css`, `shell.ts` (the frame's places and strings), `offline.ts` (outbox senders), `data-domains.ts`. Downstream-owned; the foundation ships neutral defaults |
| `amplify/data/resource.ts` | foundation schema (Organization/User/Site/EventLog/billing/TesterFlag/AssistEvent/ExportJob) |
| `amplify/data/vertical.ts` | the per-module registry (`moduleContributions`) composing `amplify/data/modules/<id>.ts` into the foundation API, filtered by `BACKEND_MODULES` and by each module's data domain; `applyVerticalBackend` for product CDK wiring |
| `amplify/data/domains/` | the data domains (`docs/data-domains.md`): `assignments.ts` names them and which module sits on which (downstream-owned, empty here), `registry.ts` composes each one's schema, `index.ts` builds and wires every composed domain in one loop |
| `amplify/data/{entitlements,record-access}/` | APPSYNC_JS pipeline steps (`.js`) + their tests |
| `amplify/functions/<name>/` | Lambdas (`resource.ts` + `handler.ts`); some have their own `package.json` |
| `amplify/custom/<name>/` | Raw CDK constructs for what `defineFunction` cannot package (the media CDN's sharp transform, the export renderer's react-pdf): a `NodejsFunction` with an install hook, wired by hand in `backend.ts`; also the map services' IAM (`location/`) and the WAF on the API's public read (`public-read-guard/`) |
| `amplify/data/assist-helpers.ts` | Product seam for Assist: one helper per job (`amplify/shared/assist/types.ts`), run by `assistRun`; `docs/spine-services-design.md` § 2 |
| `amplify/data/export-providers.ts` | Product seam for the export service: one provider per record type builds the document model (`lib/export/model.ts`); `docs/spine-services-design.md` § 3 |
| `lib/` | shared utils (`cn()`, `getDataClient()` and `getModuleClient()`, module entitlement logic, `roles.ts`, `time/` zone-aware clock and ISO-date math used by client and Lambdas, `export/`, `assist/`, `shell/` and `hooks/` for the app frame) |
| `lib/map/` | the map engine (`docs/map-engine.md`): one `MapView` on MapLibre with a state model, basemap providers (Amazon Location, an invented grid, PMTiles), the layer contract and registry, symbol sprites, drawing and measure (Terra Draw), address search, the printed copy. Holds no product facts: a product publishes layers from `lib/services/<id>/layers.ts` and renders `MapView` |
| `lib/offline/` | the device outbox (`docs/offline.md`): writes saved on the device and sent in order when there is signal; `OutboxProvider` in `app/(app)/layout.tsx`, one sender per module in `config/offline.ts` |
| `scripts/` | check scripts (`check-backend`, `check-cfn-cycles`, `check-resolvers`), `sandbox` (staged deploys), `generate-domains` |
| `docs/` | design docs and playbooks |

Path alias `@/*` maps to the repo root, **except inside `amplify/`** (see Gotchas).

## Commands

```bash
npm ci                         # install (postinstall copies MapLibre's worker files into public/)
npm run dev                    # Next dev server; needs amplify_outputs.json (see Gotchas)
npm test                       # vitest run, all colocated *.test.ts
npx vitest run path/to/file.test.ts      # single file;  add -t "name" for one test
npx tsc --noEmit               # root typecheck
npx tsc --noEmit -p amplify/tsconfig.json  # backend typecheck exactly as ampx deploy runs it
npm run lint                   # eslint (next core-web-vitals + typescript)
npm run check:backend          # full local CDK synth + CFN cycle scan, no AWS creds (~40s)
npm run check:entitlements     # entitlement decision-table tests
npm run check:resolvers -- --profile <aws-profile>  # validate APPSYNC_JS via AppSync (needs AWS creds)
npm run sandbox -- --profile <aws-profile> --modules none --once   # a sandbox, in stages (docs/bootstrap.md)
npm run generate:domains       # regenerate lib/data-domains/<domain>.introspection.json from the domain schemas
npm run check:pr               # the PR gates on the current branch's PR (docs/pull-request-gates.md § 2; needs gh)
npm run test:coverage          # the suite with the coverage floors CI holds (vitest.config.ts)
npx next build                 # production build
```

**CI** (`.github/workflows/ci.yml`, every PR and push to `main`): `npm ci`, stub
`amplify_outputs.json` with `{}`, `npm run test:coverage`, `npx tsc --noEmit`,
`npx tsc --noEmit -p amplify/tsconfig.json`, `npx eslint . --max-warnings=0`, `npm run check:backend`,
and `npx next build` in a second job. Lint runs on the **whole repo at zero warnings** and includes
the module import boundaries (below), so a single new warning fails the PR. Beside CI, every PR runs
the gates in `docs/pull-request-gates.md`: `conventions`, `tier-1 review`, `secret-scan`,
`dependency audit` and the AI review `claude-review`; the ruleset makes all of them required.

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
  schema file, its `moduleContributions` entry in `vertical.ts`, its data domain line, thin routes
  with `<ModuleShell>`, tests).
- **Data domains** (`docs/data-domains.md`): the foundation API holds organizations, users,
  entitlements and the shared services; once a product declares domains, a module's tables live on
  its product group's own AppSync API (one per group, each with its own CloudFormation caps),
  chosen by one line in `amplify/data/domains/assignments.ts`. A module's screens reach its rows
  with `getModuleClient("<id>")`, its Lambdas with `graphql(query, vars, moduleApi('<id>'))`; the
  foundation's rows stay on the foundation client. The foundation ships no domain.
- **Module boundaries** (`docs/data-coupling.md`): one owning module per table, and nothing else
  writes it, except through write code the owner publishes under `lib/` (gated to either module by
  `sharedModuleTables`). `modules/<a>/` never imports from `modules/<b>/` (eslint fails the PR); a
  schema file
  never `a.ref`s / relates to another module's models (`lib/schema-boundaries.test.ts`); a module
  reads another's data only through its published contract and must work when that module is not
  licensed. Cross-module effects travel as events into the owner's stream handler.
- **Maps** (`docs/map-engine.md`): the engine in `lib/map/` is foundation code and the only map; a
  product renders `MapView` with layers it publishes from `lib/services/<id>/layers.ts` (a bounded read,
  a style, a classification) and sprites from its own catalog, keeps its records in its own tables and
  never wires MapLibre itself. The map services' grants are on every org group's role
  (`amplify/custom/location/`); the API's public read sits behind the WAF guard
  (`amplify/custom/public-read-guard/`). Nothing under `lib/map/` imports `modules/`, `config/` or
  `lib/services/` (`lib/map/engine-boundary.test.ts`).
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
- **The app frame owns the chrome** (`docs/shell.md`): three sidebar states (FULL, COMPACT when a
  module's section rail is open, hidden on a phone), one `SectionRail` with scroll spy, one door
  switch, a phone toolbar that never auto-hides. A module never draws its own sidebar, top bar or
  door switch; it registers sections and navigation data. The door (Field, Station, Admin) comes
  from `useDoor()` in `app/components/DoorContext.tsx`; the frame's places and strings are a
  product's values in `config/shell.ts`. Browser storage lives in `lib/shell/preference-store.ts`
  only (a test fails any other file).
- Product strings come from `config/`, not hardcoded in foundation files.
- **No button that only shows a message.** A control changes real state, shows an honest empty
  state, is hidden, or says what is missing inline; a toast is never the only outcome. A changed
  screen adds no new `toast(` call or sonner import (the `conventions` check fails it); existing
  ones are cleaned as their screens are touched.
- Every module keeps `docs/<id>-module.md` with `## Provides` and `## Consumes` sections and,
  once it is being built, a `docs/<id>-changelog.md` build-state record, updated in the same
  change as the code (the `conventions` check fails module work without one).
- Line endings are LF (`.gitattributes`).
- **Commits:** `<area>: <imperative subject>`, e.g. `foundation: ...`, `docs: ...`, `fix: ...`.
  One concern per commit. Foundation code carries no product facts: no client names, domains,
  Stripe ids, AWS account ids, or org names in fixtures, tests or comments.
- **Branches:** one change, one branch, branched from and merged to `main` by pull request. Pull
  requests target `main`; a PR based on another feature branch is refused by the `conventions`
  check. Branch and title shapes are a habit, not a gate.
- **Tier 1 review** needs a person, never only an agent: sign-in, sessions, permissions, the
  foundation schema, anything that sends outside the organization, production releases and
  deletes, a removed or shared test. In GitHub that is `.github/CODEOWNERS` (the lead approves a
  change to the foundation backend and its wiring, the app frame, the entitlement decision and the
  other foundation code under `lib/`, the registry and prices in `config/`, `scripts/`, `.github/`,
  a dependency, the rulebooks) plus the `tier-1 review` check, which also holds a PR that removes a
  test or edits a shared one, a module schema that adds a public, guest or authenticated rule, a
  module Lambda that reaches outside the organization, and anything the AI review classifies as
  Tier 1 by what it does. Everything else is product work and merges on its own when the checks
  are green (`docs/pull-request-gates.md`). A product mirror adds its own Tier 1 categories here
  (regulated data, money, anything with legal weight) and the review reads them from this file.

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
5. Open a **draft** PR with a plain-language before/after summary and the checks you ran (the
   template asks for both). Update the relevant `docs/` file when you add a capability or change a
   convention. Marking the PR ready for review turns on auto-merge: it merges by itself once every
   check is green, the AI review has no blocking finding, every review thread is resolved and, for
   a Tier 1 change, the lead has approved. The review opens a thread only for a blocking finding
   and answers the other readers' threads (Copilot's, its own earlier ones); advisories are in its
   summary. A thread a person opened is theirs to resolve. A red check says in its log what to
   change; `npm run check:pr` runs the conventions locally. `@claude <instruction>` in a PR comment
   asks Claude in CI to make a change and push it; the `auto-fix` label lets it fix the review's
   blocking findings once per push. Never edit `.github/`, CODEOWNERS or a ruleset file to make a
   check pass: those are the lead's.
6. Never commit secrets, `.env*`, `amplify_outputs*`, `amplify/.sandbox-operators`, or real
   customer data. Secrets are set with `npx ampx sandbox secret set <NAME>`.
7. Do not deploy, run `ampx sandbox`, or touch Stripe/AWS resources unless explicitly asked.
8. Reviewing someone else's PR: follow `docs/playbooks/reviewing-a-pr.md` (worktree per PR, merge
   `main` first, run what CI runs, three read passes, fix every violation in the PR, hand over as a
   pure merge plus a review patch for the lead to commit).

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
- Never send `id` on a create. When the caller is authorized only through a rule that names its
  fields (an owner rule on one column, a field-level rule), the generated auth step checks every
  input field against that list and an undeclared `id` is not on it ("Unauthorized on [id]"); a
  caller a group rule authorizes on every field (Admin, Member on most models) is not checked, so
  one module's creates may take a client id while another's do not. The rule is the same either
  way, since the next field rule changes the answer: declaring `id` to allow it adds a pipeline
  function, and a gated model's mutations already sit at AppSync's limit of ten ("A resolver can
  only be composed of 10 functions"). Create the row first and use the server's id afterwards.
- AppSync's condition input for an enum column has only `eq` and `ne`: a handler's
  `attributeExists` on an enum condition fails every write at run time. Assert on a string or
  timestamp column instead.
- `MEDIA_CDN_PRIVATE_KEY` must exist as a secret in each environment or the deploy fails
  (placeholder fine). Module prices are one secret, `STRIPE_MODULE_PRICES` (JSON, module id to
  Stripe Price id), bound only in an environment that may sell a module (`sellableModules` or
  `NEXT_PUBLIC_MODULE_STAGES`), and it must exist there. Never bind one secret per module: a
  Lambda's environment is capped at 4 KB and the deploy fails at about a dozen.
- Some Lambdas are wired but still stubbed (`event-logger`, `organization-trigger`,
  `newsletter-subscriber-trigger`, `ses-webhook-handler` DB updates): wiring deploying
  does not mean behavior works. Parts of `docs/` predate current conventions; code wins over docs.
- A function behind `a.handler.function` receives Amplify's invoke payload, `{ typeName, fieldName,
  arguments, identity, source, request, prev }`, with `fieldName` at the top. The aws-lambda
  `AppSyncResolverEvent` type puts it under `info`, so `event.info.fieldName` typechecks, passes
  synth, and throws "Cannot read properties of undefined (reading 'fieldName')" on the first real
  call (every command handler of one product had it). Read the name with `operationName(event)`
  from `amplify/shared/appsync-event.ts`, never from `info`.
- An ESM `NodejsFunction` (`amplify/custom/`) that bundles the AWS SDK needs the `createRequire`
  banner in its bundling options: the SDK is CommonJS and calls `require()` for Node built-ins on
  its first request, and esbuild's shim throws "Dynamic require of "node:https" is not supported".
- A command Lambda called by another Lambda over IAM has no Cognito `sub`: `resolveCaller`-style
  helpers refuse it. Give such a path an explicit, narrowly scoped system caller rather than
  widening the user path.
- Outbound notifications: `dispatch()` in `amplify/shared/notify.ts` is the one seam every module
  sends through. `log` mode only simulates sends and must be refused on deployed branches
  (`NOTIFY_MODE`, set by `amplify/backend.ts` or `applyVerticalBackend`; unset reads as `none`).
  Provider adapters plug in behind `dispatch()`. Do not add a second bespoke sender.
- Amplify's data client authorizes AppSync with the **access token**, so anything that must
  change what AppSync sees (groups, a marker claim) has to land on that token. A Cognito pre
  token generation trigger attached by `defineAuth` is version 1 and edits the ID token only;
  `amplify/backend.ts` re-attaches it as `PreTokenGenerationConfig` `V2_0` (needs the Essentials
  or Plus pool tier). A trigger Lambda's role policy must not name the pool ARN: the pool's
  `LambdaConfig` already points at the function, and the function depends on its own default
  policy, so the cycle scan fails (`docs/sign-in-and-mfa.md`).
- A signed-in user in a Cognito group assumes that **group's IAM role**, not the authenticated
  role. Any grant made only to `allow.authenticated` (storage) or `authenticatedUserIamRole`
  (custom constructs) reaches nobody in a group, which is every onboarded user. Grant the org
  groups too (`allow.groups([...])`; `backend.auth.resources.groups[g].role`), never Operator.
- CloudFormation caps a stack at 500 resources and CDK refuses to synthesize past it ("Number of
  resources in stack ... is greater than allowed maximum of 500"), at the end of the synth, after
  `check:backend` has already printed "synth OK". The data stack holds every schema-granted
  function with its role and policies and one event source mapping per stream consumer; the
  stream-ARN lookups (a custom resource per streamed table) live in the `streams` nested stack
  under it (`amplify/backend.ts` #1). A new module adds a model stack per model and a function's
  worth of role and policies per command; the counts are in the synthesized templates under
  `.amplify/local-check/`, and `check:backend` prints one line per API. Never move an event source
  mapping between stacks: CloudFormation creates the new one before it deletes the old one and
  Lambda allows one mapping per stream and function ("provided mapping already exists"). The
  nested stack has its own caps of 200 parameters and 200 outputs.
- IAM caps a role's inline policies at 10,240 bytes, and only at deploy time ("Maximum policy
  size of 10240 bytes exceeded for role"). Every `AwsCustomResource` in a stack shares one provider
  Lambda, and each one given its own `policy` adds an inline policy to that role, so a hundred
  lookups overflow it. Give such resources one shared `role` (the stream lookups in
  `amplify/backend.ts` #1 do), never a policy each.
- CloudFormation also refuses a template body over 1,000,000 bytes, and only at deploy time
  ("Template may not exceed 1000000 bytes in size"). Every model is a nested stack resource with
  parameters, every function a role and policies, every streamed table a mapping.
  `amplify/backend.ts` #9 synthesizes every stack without indentation (about a fifth smaller);
  `check:backend` fails on an indented or oversized template and warns past 85%. Past that, the
  lever is a data domain per product group (`docs/data-domains.md`), not a smaller module.
- WAFv2 validates a web ACL's `description` only at deploy time: word characters, `+=:#@/-,.`
  and inner spaces, nothing else ("failed to satisfy constraint: Member must satisfy regular
  expression pattern"). The guard's description lives in `amplify/custom/public-read-guard/rules.ts`
  with a test against the pattern.
- CloudFormation also caps one stack operation at 2,500 resources across the root and every nested
  stack it touches ("Limit on the number of resources in a single stack operation exceeded"; not
  adjustable). A backend of 130 models synthesizes to about 6,800 resources, so a from-scratch
  deploy fails; environments that grew by updates never notice. A new environment is bootstrapped
  in stages with `BACKEND_MODULES` (`docs/bootstrap.md`: `none`, then batches of about 40 models,
  then unset). A module left out of the list is deleted from the environment, tables included.
  Never test a change by creating a fresh stack of the whole backend.
- A function of a module on a data domain declares `resourceGroupName: domainStackName('<domain>')`
  (`amplify/data/domains/assignments.ts`) so it lives in the domain's stack: its environment reads the
  domain API's URL and the API's data source names the function's ARN, which is a cycle between two
  stacks and same-stack references in one. The domain builder refuses a function elsewhere. A domain
  function reaches its own rows with `graphql(query, vars, moduleApi('<id>'))`
  (`amplify/shared/graphql.ts`) and the caller with the plain call; it is never granted on the
  foundation schema.
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
