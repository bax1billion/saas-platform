# Data domains: one AppSync API per product group

**Status:** built and proven, 2026-10-12. Decided 2026-10-10 for a
product of nine built modules whose one data API was within a few modules
of CloudFormation's caps; the seam landed in the foundation and every
built module of that product moved onto its group's API over the next two
days, on a sandbox, then staging, then production. § 8 is the proof log
with the numbers; § 9 is the fourth cap the move uncovered and the staged
bootstrap that answers it (`docs/bootstrap.md`).

## 1. The problem

Every module's tables, functions and stream handlers compose into one
Amplify data API (`amplify/data/resource.ts` spreads `verticalModels` and
`verticalFunctions` from `amplify/data/vertical.ts`). Amplify renders that
API as one CloudFormation "data" nested stack, and CloudFormation caps a
stack at 500 resources and a template at 1,000,000 bytes. Both caps are
hit at deploy time, after `check:backend` has printed "synth OK"
(`CLAUDE.md` Gotchas).

Measured on a product's staging with nine modules (133 models, 40
functions), synthesized without indentation:

| Data stack | Used | Cap |
|---|---|---|
| Resources | 455 | 500 |
| Template bytes | 842,247 | 1,000,000 |
| Streams nested stack parameters | 116 | 200 |

What the budget is spent on, from the synthesized template:

| Driver | Count | Resources each | Bytes each |
|---|---|---|---|
| Model nested stacks (one per `a.model`) | 133 | 1 | ~3.9 KB |
| Stream mappings (the audit log and module handlers) | 132 | 1 | ~0.5 KB |
| Lambdas with role and policies | 40 | ~4 | ~4.6 KB |

So a module costs about two resources and 4.4 KB per model plus four
resources and 4.6 KB per function, before anything it does. A module of
7 models and no functions cost 13 resources and 30 KB; the largest module
had 35 models and 9 functions. With eight more modules planned at a
conservative 10 models and 3 functions each, the lineup needed about 280
resources and 480 KB, and the one API had 45 resources and 158 KB left.

Trimming (fewer indexes, one Lambda for several commands, a Kinesis stream
in place of per-table mappings) buys three or four modules and leaves the
same cliff for the next one. The lineup needs a partition.

## 2. Decision

**A data domain is one AppSync API with its own stack tree, and the
platform has one domain per product group plus one for the foundation.**

| Domain | Holds |
|---|---|
| `foundation` | Organization, User, Site, EventLog, billing, entitlements, ExportJob, Assist, and whatever shared records a product declares core |
| one per product group | the group's modules: their models, functions, stream handlers, pipeline steps |

Why the group and not the module:

- **The boundary already exists.** A module schema never `a.ref`s another
  module's models (`lib/schema-boundaries.test.ts`), `modules/<a>/` never
  imports `modules/<b>/` (eslint), a module reads another's data only
  through a published contract under `lib/`, and the shared records are
  foundation. Every cross-module path is by id or through published code,
  which is exactly what crosses an API boundary without change.
- **Quota.** AppSync allows 25 APIs per region per account by default
  (raisable). A handful per environment, with an account per environment,
  is comfortable; one per module is not once a second branch or a sandbox
  shares the account.
- **Headroom.** The largest group lands near 60 models and 15 functions,
  under half a cap, with the same per-model cost as today. A group that
  outgrows its API splits by changing the module's domain line in the
  registry (§ 5 on when that is cheap).
- **It matches the product.** Groups are the lineup's own structure, the
  sidebar sections and the pricing bundles, so a domain per group is
  explainable in the product's words.

Module to domain is one line in `amplify/data/domains/assignments.ts`
(`moduleDomains`), and a test fails when a module's schema is composed
into a domain other than its own.

## 3. Design

### 3.1 Backend: a domain is a composition, built by one construct

`amplify/data/vertical.ts` is a per-module registry (`moduleContributions`):
one entry per module with its models, entity types, event actions, seeds,
stream tables, gated tables, command mutations, functions, stream
consumers, record-access policies and API pipeline steps. Everything the
foundation API composes (`verticalModels`, `verticalFunctions`, ...) is
derived from the entries of the modules on the foundation;
`domainContribution(domain)` derives the same shape for each domain.

`amplify/backend.ts` keeps `defineData` for the foundation domain exactly
as it is (Amplify owns its outputs, its introspection and its sandbox
behaviour). For every other domain it builds the same construct Amplify's
`defineData` wraps, `AmplifyData` from `@aws-amplify/data-construct` (a
dependency of `@aws-amplify/backend-data`), in a domain stack
(`amplify/data/domains/index.ts` `buildDataDomain`):

- definition: `a.schema(domain.models).transform()` gives the SDL and the
  function slots; `AmplifyDataDefinition.fromString(sdl, { dbType:
  'DYNAMODB', provisionStrategy: 'AMPLIFY_TABLE' })` is the definition,
  with Amplify's managed table strategy so a module keeps the same table
  semantics on either API (a definition without a strategy gives plain
  CDK tables, which have no stream setter). The custom mutations that
  name a function (`a.handler.function(fn)`) map through `functionNameMap`
  to the domain's `defineFunction` constructs.
- authorization modes: the same Cognito user pool, the identity pool
  roles, and IAM authorization enabled so foundation Lambdas (export
  providers, Assist helpers, the event logger) can call it. A public
  (API key) operation stays on the foundation (§ 3.6).
- Amplify's one-nested-stack-per-model shape is what keeps each model's
  pipeline functions out of the domain stack.
- outputs: the domain's URL and region go out through
  `backend.addOutput({ custom: { dataDomains: { <id>: { url, region } } } })`
  and into an SSM parameter for the foundation's own Lambdas (§ 3.4).

The per-API steps that take the API's resources keep their shape and run
once per domain: `applyEntitlementEnforcement(resources, options)`,
`applyRecordAccess(resources, policies)` and each module's own `apiSteps`.
They are functions of an `ApiResources` argument, which is the construct's
`resources` for a domain just as it is `backend.data.resources` for the
foundation.

**Entitlements stay one decision.** The APPSYNC_JS entitlement step reads
the org's subscription rows. Those live in the foundation domain, so the
domain API gets DynamoDB data sources on the foundation's `User`,
`OrgSubscription` and `OrgEntitlementOverride` tables (imported by name,
read-only on the table and its indexes), named the way the step looks them
up. One decision table, one code path, every API.

### 3.2 Streams and the audit log

Every domain table that streams keeps streaming. The `EventSourceMapping`
for a domain table is created in that domain's stack (never anywhere
else: a mapping is unique per stream and function and cannot move,
`CLAUDE.md` Gotchas), targeting the foundation event logger Lambda across
stacks, and the stream-ARN lookups live in a `streams` nested stack under
the domain with one shared lookup role, as the foundation does
(`amplify/backend.ts` #1). Module stream handlers are the domain's own
functions on the domain's own tables, granted stream reads by
`attachDomainStreams` (Lambda refuses a mapping for a role that cannot
read the stream).

The event logger gains nothing: a stream record is a stream record. Its
`EntityType` enum is composed from every module as before.

### 3.3 Client: one typed client per domain

This is the only genuinely new piece. Amplify's `generateClient` accepts
a custom `endpoint` with an explicit `authMode`, but a client built that
way gets **no** typed `models`, `queries`, `mutations` or `subscriptions`
(the source sets them to a throwing proxy and carries a TODO for multiple
endpoints). The runtime it uses to attach the typed surface to the default
client is exported from `@aws-amplify/data-schema/runtime` as
`addSchemaToClient(client, graphqlConfig, getInternals)`, and the model
operations route to the client's own endpoint when one is set.

So the domain client (`lib/data-client.ts`) is:

```ts
export function getDomainClient<D extends DomainId>(domain: D): DomainClient<D> {
  // foundation: the default client, unchanged
  // others: generateClient({ endpoint, authMode: 'userPool' }) +
  //         addSchemaToClient(client, { endpoint, region, defaultAuthMode,
  //           modelIntrospection: introspections[domain] }, getInternals)
}
export function getModuleClient(moduleId) { return getDomainClient(domainOf(moduleId)); }
```

Each domain has its own `Schema` type (`DomainSchema<'<domain>'>` from
`amplify/data/domains/registry.ts`), so a module's `Schema["Widget"]["type"]`
becomes `DomainSchema<'operations'>["Widget"]["type"]`. A module's code
calls `getModuleClient("widgets")`; foundation code keeps
`getDataClient()`. The introspection a domain client needs cannot ride a
CloudFormation output (1,024 bytes), so `npm run generate:domains` writes
`lib/data-domains/<domain>.introspection.json` and the index that imports
them, committed and held current by `lib/data-domains/introspection.test.ts`.

### 3.4 Lambdas

A function behind a domain's `a.handler.function` is instantiated in the
domain's stack (it declares `resourceGroupName: domainStackName('<domain>')`;
a function elsewhere would make a cycle, since its environment reads the
API's URL while the API's data source names its ARN, and the builder
refuses it). It is granted `appsync:GraphQL` as a pattern on the account,
gets `GRAPHQL_ENDPOINT` (the foundation, for the caller lookup and the
shared records) and `DATA_DOMAIN_ENDPOINTS` (its own domain), and
`amplify/shared/graphql.ts` takes a target for the calls that go to its
own rows: `graphql(query, vars, moduleApi('<id>'))`.

A foundation Lambda that reads a module's rows (an export provider, an
Assist helper, the media auth and ingest seams) resolves the domain's URL
at run time from the SSM parameter the domain stack wrote
(`grantDomainUrlLookup`, every function in `allTriggerFunctions`): a
CloudFormation token would make the data stack depend on the domain
stack, which already depends on the data stack. The seams' `graphql`
signatures carry the same optional target.

### 3.5 What does not change

- **Module boundaries** (`docs/data-coupling.md`): the same rules, now
  enforced by a network boundary as well as a lint rule.
- **Shared tables across groups**: a table one module owns and another
  module's screens write through the owner's published code uses the
  owner's domain client; the `sharedModuleTables` gate stays on the
  owner's API.
- **Shared records**: foundation, read by every domain client through the
  foundation client and the foundation commands.
- **Export, Assist, notifications, the device outbox**: foundation
  services with product seams; the seams gain a target where they name a
  table.
- **The record-access engine and a module's pipeline steps**: per-API
  steps, run per domain.
- **The doors, the app frame, entitlement decisions on the client**
  (`useEntitlements`): untouched.

### 3.6 The seam

- `amplify/data/domains/assignments.ts` lists the domains
  (`DATA_DOMAINS`) and which one each module sits on (`moduleDomains`).
  Adding a module to a domain is one line there; adding a domain is one
  id. Downstream-owned: the foundation ships no domain.
- `amplify/data/vertical.ts` carries every module's contribution,
  including its API pipeline steps (`apiSteps`), and derives each
  domain's composition (`domainContribution`, `composedDomains`).
- `amplify/data/domains/registry.ts` holds the one type line per module
  on a domain (the client's `Schema` for the domain must not change with
  a deploy) and the composed schema per domain. Downstream-owned.
- `amplify/data/domains/index.ts` `wireDataDomains` builds every
  composed domain in one loop: the API in its stack (taken from the
  domain's functions when it has any), the entitlement step with the
  domain's tables, shared tables and command mutations, the record-access
  step, the modules' own pipeline steps, the audit stream to the event
  logger plus the modules' stream handlers (a handler must be a function
  of the same domain), the URL in the outputs and in an SSM parameter.
- `lib/data-client.ts` types one client per domain from the registry;
  `npm run generate:domains` writes each domain's introspection and the
  index the client imports. `getModuleClient(moduleId)` routes by the
  assignment.

Deploying a module onto a domain is therefore: its line in
`moduleDomains`, its type line in the registry, its functions'
`resourceGroupName`, its handlers' `moduleApi('<id>')` targets for their
own rows, its screens' `getModuleClient`, and `npm run generate:domains`.

A module on a domain may keep operations on the foundation API
(`foundationModels` and `foundationFunctions` in its registry entry): a
public query that only the foundation's API key authorizes stays there
with its Lambda (`resourceGroupName: 'data'`), and that Lambda reads the
module's rows on the domain through the published URL like every
foundation function (one public surface, one key, one place for a WAF).

The enums a module schema may `a.ref` and no module owns live in
`amplify/data/shared-types.ts`, composed into the foundation schema and
into every domain with models: a domain API is its own schema and must
define every type it names. The same enum on two APIs is fine;
`lib/schema-boundaries.test.ts` counts the shared types as core.

## 4. Capacity after the split

Per-model and per-function costs do not change; the caps do, because each
domain has its own. `check:backend` prints one line per API stack
(resources, bytes, model stacks) and warns past 85%, plus the fresh-create
total (§ 9). The product that drove this finished with the foundation
data stack at 20% of its resource cap and the largest domain at 28%.

## 5. Migration and timing

**Moving a table between APIs replaces it.** A model that leaves the
foundation API for a domain API is a new DynamoDB table under a new stack;
every row in the old one is gone with the old stack. That is the whole
cost, and it sets the timing: before the first real write the move costs
a re-seed; after it, a data migration per table.

Recommended order:

1. **Spike**: one domain API on a sandbox, one module, the typed client,
   a subscription, an entitlement refusal, a stream to the audit log, a
   Lambda command. Prove or kill the client shim (§ 7).
2. **The seam** (§ 3.6), `check:backend` per domain, the tests.
3. **The move**: every built module into its domain, one stage per deploy
   (§ 9), with a re-seed of the environment. Nothing stays behind in the
   foundation API but the foundation. Schema work: the lead developer
   deploys.
4. **Docs and conventions**: `CLAUDE.md`, `docs/adding-a-module.md` § 2,
   `docs/modules.md`, `docs/core-data-model.md`.

A new module goes straight on its domain (`docs/adding-a-module.md` § 2).

## 6. Alternatives considered

- **Trim the one API.** Drop by-org indexes nobody reads, fold command
  Lambdas into one, stop streaming tables the audit log does not need.
  Buys three or four modules; the next one hits the same cliff, and every
  trim is a design compromise made for a deploy limit.
- **Kinesis in place of per-table stream mappings.** One Kinesis stream
  for every table's changes, one mapping for the event logger. Saves
  about 130 resources and 70 KB in the data stack, costs a shard-hour fee
  and changes the handler's record shape and ordering guarantees. Worth
  doing inside a domain if a domain's stream count ever matters; not a
  partition.
- **AppSync merged API.** The domains are source APIs; one merged API
  fronts them with one URL, one client, one introspection. Removes the
  client shim entirely. Adds: an association resource per source whose
  merge runs after every source schema change (auto-merge is
  asynchronous, so a deploy can finish before the merged schema is live),
  identical auth modes on every source, a union introspection built by
  hand for `Amplify.configure`, and pricing to confirm. Kept as the
  fallback if § 3.3 had failed on a real stack; it did not.
- **One API per module.** Cleanest boundary, one API per module per
  environment: over the default quota once a sandbox or a second branch
  shares an account, and as many sets of outputs, endpoints and IAM
  grants for little gain over the group.
- **Amplify's own multi-API support.** Not offered by Gen 2 today
  (`defineData` is a singleton); the construct it wraps is public, which
  is what § 3.1 uses.

## 7. The spike

Build, in order, each step on a sandbox before the next:

1. A domain stack with one `AmplifyData` holding one module's models (the
   module's schema file unchanged, composed into the domain instead of
   `verticalModels`), user pool plus IAM auth, outputs with the URL.
2. `getDomainClient('<domain>')`: the custom-endpoint client with the
   typed surface attached. Prove a `create`, a query on a secondary
   index, an `onCreate` subscription, and that `errors[0].message`
   carries an entitlement refusal unchanged.
3. The entitlement step on the domain API reading the foundation's
   subscription tables (§ 3.1): an organization without the module gets
   the same refusal text as on the foundation API.
4. A table streaming to the foundation event logger from the domain
   stack.
5. One command Lambda on the domain (resolving the caller through the
   foundation endpoint and writing a row through the domain endpoint),
   to prove the two-endpoint Lambda shape.
6. `check:backend` printing the domain stack's counts.

Acceptance: every step observed on a sandbox and written down with the
numbers; `npm test`, both `tsc` configs, eslint, `check:backend` and
`next build` green; the module's screens work against the domain client
with no change beyond the client import.

## 8. Proof log (a product of nine modules, 2026-10-10 to 2026-10-12)

**Synth, one module of 7 models on a domain.** The domain stack was 32
resources (7 model stacks) and 47 KB; the foundation data stack fell from
455 to 442 resources and from 842 KB to 813 KB. The entitlement step gated
21 mutations on the domain API. No resource cycles.

**The first sandbox deploy, and a fourth cap.** A fresh stack rolled back
after fifteen minutes with every model nested stack failing on "Limit on
the number of resources in a single stack operation exceeded": the quota
of 2,500 resources per stack operation across the nested tree (§ 9). The
synthesized backend was 6,796 resources. Environments that grew by
updates never hit it; **no new environment could be created from that
backend in one deploy.** The rollback also left the root stack in
`ROLLBACK_FAILED` (a subscription resolver refused to delete before its
API); a plain `delete-stack` cleared it.

**Steps 1 to 3 on the sandbox.** With the staged bootstrap in place the
sandbox came up in two deploys (`BACKEND_MODULES=none`, 1,060 resources,
19 minutes; then the one module, 1,408, 3 minutes) with the domain API
beside the foundation API and `custom.dataDomains.<domain>` in the
outputs. The deploy role of the sandbox account cannot write a table or
create a user, so the smoke organizations are seeded by the deploy itself
(`SANDBOX_SEED`, `docs/bootstrap.md`). A CommonJS smoke script signed in
as the seeded Member of the licensed organization and then of the
unlicensed one, against the deployed stack:

| Check | Result |
|---|---|
| Typed `models` on the custom-endpoint client | present |
| `create` through the domain API | row created, server id |
| The new secondary index | returns the row |
| `onCreate` subscription on the domain API | delivered the row |
| Foundation client beside it | works |
| A delete the schema forbids | refused |
| Unlicensed organization's create | "The "<module>" module is not licensed for this organization." |

Three things the run taught: the data-source role for a foundation table
imported by name gets no index permissions from CDK's grant (the first
`usersByCognitoSub` query failed until the builder granted read on
`table/*/index/*`); the domain API's auth template has no IAM branch
unless the construct's IAM authorization mode is enabled (as `defineData`
does for `allow.resource`); and a smoke script in ESM configured a second
copy of Amplify's core that the CommonJS-loaded `lib/data-client.ts` never
saw ("API configuration is missing", "No current user").

**Step 4.** `attachDomainStreams` streams the module's audit tables to the
foundation event logger (6 lookups, 6 mappings; the domain stack 40
resources). Changing a table's strategy (plain CDK tables to Amplify's
managed strategy) replaces it under the same name, and CloudFormation
creates before it deletes, so the redeploy failed with "Table already
exists"; the fix was two deploys (the module out, then in), which is the
general rule for any table shape change in a domain.

**Step 5.** A module with one function and one command moved to the
domain: the function instantiated by `defineBackend` in the domain stack
(`resourceGroupName`), the schema's `@function(name: ...)` slots mapped
through the transform's `lambdaFunctions`, the function granted on both
APIs with both endpoints, the command gated by the domain's entitlement
step. Proven the same day: 18 of 18 smoke checks. Two things the first run
taught: a command handler's "still pending" condition used
`attributeExists` on an enum column, and AppSync's enum condition input
has only `eq` and `ne` (the command had never run against a stack); and a
command mutation's own group rule runs before the entitlement step, so the
gate on a domain's command is visible only to a caller the rule admits.

**The seam proper, then the staged move.** Four more stages over two
days, each an update of 9 to 15 minutes on the sandbox with the smoke
script growing to 46 checks: a module's six stream handlers on a domain
stack (the first deploy rolled back on "Cannot access stream ... Please
ensure the role can perform the GetRecords, GetShardIterator,
DescribeStream, and ListStreams Actions", which is why
`attachDomainStreams` grants stream reads to every consumer it maps); a
foundation export Lambda reading a domain's rows through the
SSM-published URL; the first record-access policy on a domain (39
fields); a module's `a.ref` to a foundation enum failing the domain synth
until `amplify/data/shared-types.ts` existed; a module's pipeline step on
a domain; a shared table gated to either of two modules; a public API-key
query kept on the foundation reading the domain; a Step Functions
workflow beside its module's functions in the domain stack. When every
built module had moved, no module's tables remained on the foundation
API: its schema carried the shared records, users, entitlements, EventLog,
export, Assist and the one public query.

**Staging and production.** On a deployed branch a move deletes the
module stacks from the foundation API and creates them on the domain in
one operation, so a stage is sized under the cap (about 2,200 to 2,300
touched resources each) and the largest module (35 models, about 3,300)
went in two deploys: `BACKEND_MODULES` set on the branch to every module
but that one (the first deploy removes it from the foundation API), then
cleared (the second creates it on the domain). Lessons from the console
side: the variable is a separate map at the app level and at the branch
level and the build reads whichever is set; an empty object passed to
`update-branch` changes nothing while an empty value removes the key; and
a promotion between branches that bundles stages exceeds the cap (three
production jobs failed on it), so production was caught up with one
release job per stage commit, each under the cap. The variable ended
unset in every environment.

## 9. A fourth cap: 2,500 resources per stack operation

CloudFormation limits one stack operation (create, update or delete) to
2,500 resources across the root stack and every nested stack it touches
(the quotas page, "nested stacks"). It is not adjustable. The number that
matters is not the template's size but how many resources one deploy
creates, changes or deletes:

| Operation | Resources touched | Outcome |
|---|---|---|
| Fresh create of a 130-model backend | about 6,800 | fails |
| A deploy adding a module of 7 models | about 330 | fine |
| A deploy that moves every built module into domains at once | every moved model's stack created and deleted, about 6,000 | fails |

Consequences:

1. **A new environment is bootstrapped in stages.** The foundation first,
   then modules in batches of about 40 models. The composition in
   `amplify/data/vertical.ts` is a per-module registry filtered by an
   environment variable (`BACKEND_MODULES`, unset meaning all), and the
   module-specific wiring in `amplify/backend.ts` and
   `applyVerticalBackend` runs only for composed modules. Amplify Hosting
   reads the variable from the branch's environment, so a production
   bootstrap is a few deploys with the variable widened each time, then
   unset. `docs/bootstrap.md` is the walkthrough.
2. **The move of built modules into domains (§ 5 step 3) is also staged**:
   one domain per deploy, each under 2,500 touched resources; a module
   whose stacks created plus deleted exceed it goes in two deploys, out of
   the foundation API in one and onto the domain in the next.
3. **`check:backend` reports the fresh-create total** beside the per-stack
   numbers, and warns past 2,500 only when `BACKEND_MODULES` names a
   stage, since the full set is expected to exceed it.

## 10. Where this leaves the platform

- A product declares its domains in `assignments.ts` and `registry.ts`;
  the foundation ships none, so a product with a small lineup keeps one
  API until it needs a second. The next module of a large lineup goes
  straight on its domain (`docs/adding-a-module.md` § 2).
- A fresh environment is bootstrapped in stages (`docs/bootstrap.md`);
  a module move between APIs is one stage per deploy, and a promotion
  between branches carries one stage at a time.
- Open: the event logger is still the stub `CLAUDE.md` names, so delivery
  of a domain's audit stream is proven only as far as the mapping; a
  sandbox account whose deploy role cannot read function logs, metrics or
  mappings cannot prove more without a permission set.
