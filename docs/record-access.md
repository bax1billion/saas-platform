# Record-level access enforcement

**Status:** implemented (`amplify/data/record-access/`, 2026-09-18)
**Foundation doc.** The product-specific policy lives in the vertical seam.

Cognito group rules decide whether a *role* may touch a *model*. They
cannot say that a Member may open this case but not that one. Tenancy is
only an application-layer `orgId` filter. Record-level access closes both
gaps on the server, in the same APPSYNC_JS pipeline the entitlement gate
uses (`docs/subscriptions-and-payments.md` §6), so nothing the client
does can bypass it.

## 1. The model

A **policy** names a *root* model — the record that carries the access
decision — and its *children*, rows keyed to the root by a foreign key.
The product supplies the decision as a JS snippet (APPSYNC_JS subset)
defining three functions over `caller = { sub, groups, orgId }`:

| Function | Answers |
|---|---|
| `canView(record, caller)` | may this caller read the record (and its children)? |
| `canEdit(record, caller)` | may this caller write it (and create/update/delete its children)? |
| `validateWrite(existing, input, caller)` | is this create/update shape allowed? returns an error message or `null` |

```ts
// amplify/data/vertical.ts
export const verticalRecordAccess: RecordAccessPolicy[] = [
  {
    root: 'Widget',
    foreignKey: 'widgetId',
    children: ['WidgetNote', 'WidgetFile'],
    rootListQueries: ['widgetsByOrg'],
    childByRootQueries: { WidgetNote: ['widgetNotesByWidget'] },
    childDeniedQueries: { WidgetNote: ['widgetNotesByOrg'] },
    decisionSource: readFileSync(fileURLToPath(new URL('./widget-access.js', import.meta.url)), 'utf8'),
  },
];
```

`amplify/backend.ts` hands the list to `applyRecordAccess` after the
entitlement steps. An empty list means group rules only.

## 2. What the engine inserts

| Field | Steps (around Amplify's data resolver) | Effect |
|---|---|---|
| `get<Root>`, `list<Root>`, `rootListQueries` | data → caller → **filter** | a record the caller may not view comes back **null**; lists keep only viewable items |
| `create<Root>` | caller → **validateWrite(null, input)** → data | shape rules on new records; `orgId` must be the caller's |
| `update|delete<Root>` | caller → GetItem root → **canEdit + validateWrite** → data | |
| `childByRootQueries` | caller → GetItem root by `args[fk]` → **canView** → data | |
| `get<Child>` | data → caller → GetItem root by `result[fk]` → **canView** | null when the root is not viewable |
| `create<Child>` | caller → GetItem root by `input[fk]` → **canEdit** → data | |
| `update|delete<Child>` | caller → GetItem child → GetItem root → **canEdit** → data | a child may not be moved to another root |
| `list<Child>`, `childDeniedQueries` | caller → **denied** | org-wide child lists cannot be filtered per record; use the by-root query |

Rules that hold everywhere:

- **IAM callers bypass.** Lambdas are the system, exactly as for entitlements.
- **Unauthorized reads look like "not found."** Existence never leaks.
- **Unauthorized writes fail loudly** with `RecordAccessDenied`; shape
  problems with `RecordAccessInvalid`; the entitlement gate's
  `OnboardingRequired` applies to users without an org.
- **Subscriptions are disabled** on policed models (`.disableOperations(['subscriptions'])`)
  — a subscription payload would bypass the pipeline.
- **Filtered pages can be short.** A list `limit` of 50 may return 40
  after filtering; paginate on `nextToken`, never on count.
- **One extra read per request.** The caller step queries `usersByCognitoSub`
  unless the entitlement gate already resolved the org on that request.
  Root writes and child operations add a `GetItem` on the root.

## 3. What it does not cover

- **Relationship fields** (`Widget.notes`) resolve through the root, so a
  viewable root exposes its children — intended.
- **Storage.** S3 object reads never go through AppSync, so the storage
  access rules grant clients **no read on media prefixes** — S3 is the
  upload and origin location only (`amplify/storage/resource.ts`). Every
  read is a media-CDN URL issued by `getMediaAccess`, whose seam
  (`amplify/data/media-auth.ts`) applies the same decision as the
  resolvers. Variants and originals are therefore exactly as private as
  the rows, with no signed-S3 side door.
- **Field-level secrecy.** Hidden columns are a field-rule concern
  (`docs/core-data-model.md` §2.5), not a record one.

## 3a. How this sits with field rules and native GraphQL

The data-model guidance (`docs/core-data-model.md` §2.5, `docs/modules.md`
"Backend business logic") prefers three things: clients on the
**generated model operations** rather than custom resolvers; **field-level
rules** for columns with a different writer than the row; and **stream
handlers over IAM** for server-authoritative logic. Record-level access
is designed to fit under all three rather than replace any of them.

| Layer | Question it answers | Unit | Where it runs |
|---|---|---|---|
| Group rules (`allow.group`) | may this **role** touch this **model**? | model | Amplify's auth step |
| Field rules (§2.5) | may this **role** write this **column**? | column | Amplify's auth step |
| Entitlement gate | may this **org** mutate this **module** right now? | org | pipeline step (mutations) |
| **Record access** | may this **caller** touch this **row** (and its children)? | row | pipeline step (reads + writes) |
| Stream handlers / IAM | server-authoritative writes; **bypass** all of the above | — | Lambda |

What it complements:

- **Native GraphQL stays native.** Clients still call `client.models.X.get`,
  `.list`, the index queries and the generated mutations. No custom
  resolvers, no command mutations, no client-side permission logic that
  can drift. The decision runs on the server for every generated
  operation the policy lists.
- **Field rules keep their job.** Server-only columns (`sha256`,
  `fileValidationStatus`, …) are still write-to-nobody field rules; record
  access never inspects columns. The two compose: a row you may edit can
  still have columns you may not write.
- **Streams remain the default for business logic.** IAM callers bypass
  the pipeline exactly as they bypass field rules, so a handler that reacts
  to a stream is unaffected — and must still enforce tenancy itself when
  it acts on a row (unchanged rule).
- **It closes the tenancy hole the guidance flagged.** §2.1 listed
  "resolver-level enforcement" as future defense in depth; the caller step
  compares the record's `orgId` with the caller's on every policed read
  and write.

Where it departs, deliberately:

- **Reads are now gated on policed models.** The entitlement gate's
  "reads are never gated" rule was about billing; visibility has to be a
  read-time decision. Cost: one `usersByCognitoSub` lookup per request
  (skipped when the entitlement step already resolved the org) plus a
  `GetItem` on the root for writes and child operations.
- **Org-wide child queries are refused** for Cognito callers
  (`list<Child>`, `<children>ByOrg`) because they cannot be filtered per
  row without a lookup per item. Clients query children through the
  parent — a constraint on which generated operations are usable, not on
  whether they are generated.
- **Subscriptions are disabled** on policed models. A subscription
  payload skips the pipeline. (This also removes the required-field
  read-grant hazard §2.5 rule 5 describes, since it only bites while
  subscriptions are on.)
- **A denormalized access shape on the root.** `assignedSubs` and
  `grantedSubs` live on the root row rather than in an assignment table,
  because a resolver can evaluate one item without a join and lists can
  be filtered in place. The display list (`assignments` JSON) derives the
  two arrays; the arrays are the enforced truth.
- **Not Amplify's owner rules.** `allow.ownerDefinedIn(...)` would keep
  everything declarative, but it cannot express a level-dependent rule
  ("everyone if UNIT, named subs otherwise"), it adds an owner *role* that
  forces restated read grants on every required field (§2.5 rule 5), and
  it cannot cover children by foreign key. `docs/modules.md` already warns
  that row-level authority costs more than group-level; this engine is
  that cost paid once, in one place.

Rule of thumb when adding a feature: group rules for roles, field rules
for columns, record access for visibility, streams for logic. If a
requirement needs two of these on the same model, that is normal; if it
needs a custom resolver, re-read the table first.

## 4. Testing

`amplify/data/record-access/engine.test.ts` runs every step against a
fixture decision with a stubbed `@aws-appsync/utils` (same harness as
`entitlements/decision.test.ts`). A product adds a decision table for its
own snippet, and — if it mirrors the decision client-side to drive UI
controls — asserts the two agree from one table
(`amplify/data/case-access.test.ts` is the worked example).

## 5. Client conventions

- Treat `null` from a `get` as not found; do not distinguish "missing"
  from "hidden" in copy beyond "it may not exist, or you are not named on it."
- Mirror the decision in a pure lib module to show only the controls the
  server will honour; never rely on the mirror for security.
- Name the creator on a new record when its level is stricter than the
  org default — the server refuses a record its creator could not open.
