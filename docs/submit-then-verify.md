# Submit, then verify — client-created rows with a server-owned lifecycle

**Status:** foundation pattern doc, 2026-09-21. Ported from the Gen 1
`ololo` project (Pick / Entry) and mapped onto this platform's Gen 2 seams.
**Read with:** `docs/modules.md` → "Backend business logic" (the general
rule), `docs/core-data-model.md` §2.5 (field-level authorization),
`docs/adding-a-module.md` §2 (stream consumers).

---

## 1. The pattern in one paragraph

The client is allowed to **create** a row and nothing more. The row carries
a lifecycle column — `status` — whose initial value the client cannot
choose and whose later values only the server may write, plus whatever
server-computed columns the verdict produces. A Lambda on the table's
DynamoDB stream sees the INSERT, verifies the row against the facts the
client cannot be trusted with (balances, policy, references, timing), and
writes the verdict over IAM: `VERIFIED` / `PENDING` / `REJECTED`, with the
computed columns filled in. Every later state change is the same shape: a
server write on the stream, or a client write to an *intent* column the
handler reconciles. The client never updates the lifecycle directly, and
"is this row real yet?" is answered by a column AppSync would have refused
to let the client set.

It is the `docs/modules.md` default — *client writes, field rules restrict,
a stream handler reacts* — applied to the row's **birth**: the first
server-owned write is the one that turns a submission into a record.

## 2. Where it came from (Gen 1)

In `ololo` (Amplify Gen 1, GraphQL Transformer v2) an `Entry` was a user's
set of `Pick`s in a contest. Both models were shaped like this:

```graphql
type Entry @model
  @auth(rules: [
    { allow: owner, ownerField: "owner", operations: [create, read] },   # never update/delete
    { allow: private, provider: iam },                                   # the Lambdas
  ]) {
  # submitted, validated, pending, completed, void
  status: String! @auth(rules: [
    { allow: owner, ownerField: "owner", operations: [create, read] },   # client sets it ONCE
    { allow: private, operations: [create, update, read], provider: iam }
  ])
  linesWon: Int @auth(rules: [                                            # server-computed
    { allow: owner, ownerField: "owner", operations: [read] },
    { allow: private, operations: [create, update, read], provider: iam }
  ])
  lines: AWSJSON @auth(…same…)   date: AWSDateTime @auth(…same…)
  risk: Float   geoLocation: String   # client-owned
  …
}
```

and a Lambda wired to the table's stream (an `EventSourceMapping` in the
function's CloudFormation template) did the rest:

```js
// amplify/backend/function/entry/src/index.js (abridged)
if (record.eventName == "INSERT") {
  switch (entry.status.S) {
    case "submitted":
      let newStatus = "validated";
      if (!(await checkWalletBalance(entry))) newStatus = "voided";
      // …check picks, contest, timing…
      await signedFetch({ query: updateEntry, variables: { input: { id, status: newStatus, lines, date } } });
      break;
    default:
      // anything that did not start life as "submitted" is voided
      await signedFetch({ query: updateEntry, variables: { input: { id, status: "voided" } } });
  }
}
else if (record.eventName == "MODIFY") {
  // react to the server's own later transitions: a pick settling → the
  // entry's linesWon / status roll up
}
```

Three things made it work, and all three carry over:

1. **Model-level auth gave the client `create` and `read` only.** There was
   no client update path at all, so "checked on every update" was mostly
   moot — there were no client updates. The IAM rule was the Lambdas'.
2. **Field-level auth on `status`** let the owner *set* it at create but
   not change it, and made the computed columns read-only to the owner.
   The lifecycle was the server's from the first MODIFY on.
3. **The INSERT handler verified the initial value** (`submitted`) and
   voided anything else, then wrote the verdict with an IAM-signed
   mutation (`signedFetch`, SigV4 against AppSync).

The `resolvers/Mutation.*Transaction.*.vtl` overrides in the same project
were a *different* tool for a different problem — multi-item DynamoDB
transactions for the wallet — and are covered in §6.

## 3. Gen 1 → Gen 2, piece by piece

| Gen 1 (`ololo`) | Gen 2 (this platform) | Where it lives here |
|---|---|---|
| `@auth(rules: [{ allow: owner, operations: [create, read] }])` on the model | `.authorization((allow) => [allow.group('Member').to(['create', 'read']), …])` — group tier by default; `allow.ownerDefinedIn('ownerSub')` only when the domain needs a row owner (it adds an owner *role* to the model; see `modules.md` "Row-level authority costs more") | every module schema |
| `{ allow: private, provider: iam }` on the model | **No per-model IAM rule.** Lambdas are granted on the *schema* (`allow.resource(fn).to(['query','mutate'])`) and run as a transformer admin role that bypasses every model and field rule | `verticalFunctions` → `amplify/data/resource.ts` |
| Field `@auth` with `operations: [create, read]` | `.authorization((allow) => [allow.groups([...]).to(['create', 'read'])])` on the field — Gen 2 field rules take the same operation list (`create`, `update`, `delete`, `read`, …) | `core-data-model.md` §2.5 |
| Field `@auth` read-only for the owner, IAM writes | `READ_ALL` field rule (read for every group, write for nobody) — the IAM path is the only writer | a module schema's `READ_ALL` helper |
| `EventSourceMapping` in the function's CFN template | `<id>StreamConsumers: { Table: ['handlerKey'] }` → `verticalStreamConsumers`; `backend.ts` adds the mapping and stream-read policy | `adding-a-module.md` §2 "Stream consumers" |
| `signedFetch` (hand-rolled SigV4) | `graphql()` in `amplify/shared/graphql.ts` | every command / stream handler |
| `record.dynamodb.NewImage` with `.S` / `.N` accessors | `unmarshall()` from `@aws-sdk/util-dynamodb`, `NEW_AND_OLD_IMAGES` | a module's stream consumer |
| VTL overrides on generated resolvers (`resolvers/*.vtl`) | **Gone.** Generated resolvers cannot be overridden in Gen 2. Request-time logic is an APPSYNC_JS pipeline step injected through `cfnResolvers` (§6), or a custom operation with `a.handler.custom(...)` | `entitlements/`, `record-access/` |

One thing Gen 2 does **better** than the Gen 1 shape: the initial value no
longer has to be trusted and then re-checked. Make `status` read-only to
every client role and give it **no default**. A create that omits the field
succeeds and the row is born with `status` null — which *is* the submitted
state; a create that includes the field is refused with `Unauthorized on
[status]`. Nothing but the handler can ever write a value, so the Gen 1
"void anything that didn't start as submitted" branch disappears.

**The trap, verified in the synthesized resolvers (§8):** the obvious
refinement — `status: a.string().default('SUBMITTED').authorization(READ_ALL)`
— breaks every client create. Amplify applies `.default()` in the
resolver's *init* step, which runs **before** the field-authorization step;
the auth step then sees `status` among the input's keys, finds it outside
the caller's allowed fields, and refuses the whole mutation. A default on a
read-only column is only usable when every creator is a Lambda (a row that
a command creates over IAM). If the product needs a literal `SUBMITTED` at
birth — say a queue index that must list unverified rows — force the value
at request time with a pipeline step (§6), which runs after auth and
overwrites whatever the client sent.

## 4. The shape in Gen 2

```ts
// amplify/data/modules/widgets.ts — a submission the server must verify
const READ_ALL = (allow: Allow) => [allow.groups(['Admin', 'Member', 'Viewer']).to(['read'])];

WidgetSubmission: a
  .model({
    orgId: a.id().required(),
    // ── client-owned: what the submitter asserts ──────────────────────
    body: a.string().required(),
    amount: a.float().required(),
    submittedBy: a.id(),                    // denormalized actor, §6 of core-data-model
    // ── lifecycle: never client-written, and NO .default() — defaults are
    //    applied before field auth, so a defaulted read-only column fails
    //    every Cognito create (§3, §8). Null = submitted, not yet verified.
    status: a.string().authorization(READ_ALL),
    // ── server-computed verdict ────────────────────────────────────────
    verifiedAt: a.datetime().authorization(READ_ALL),
    rejectionReason: a.string().authorization(READ_ALL),
    computedTotal: a.float().authorization(READ_ALL),
    // ── queue key for "what's waiting" — server-written with the verdict
    orgStatusKey: a.string().authorization(READ_ALL),
    sortDate: a.datetime().required(),
  })
  .secondaryIndexes((index) => [
    index('orgId').sortKeys(['sortDate']).queryField('widgetSubmissionsByOrg'),
    index('orgStatusKey').sortKeys(['sortDate']).queryField('widgetSubmissionsByOrgStatus'),
  ])
  .authorization((allow) => [
    allow.group('Admin').to(['create', 'read', 'update', 'delete']),
    allow.group('Member').to(['create', 'read']),     // create and read — no update path
    allow.group('Viewer').to(['read']),
  ]),
```

```ts
// amplify/data/modules/widgets.ts — wire the verifier
export const widgetsFunctions = { widgetVerifier: widgetVerifierFunction };
export const widgetsStreamConsumers: Record<string, Array<keyof typeof widgetsFunctions>> = {
  WidgetSubmission: ['widgetVerifier'],
};
```

```ts
// amplify/functions/widget-verifier/handler.ts (shape only)
export const handler = async (event: DynamoDBStreamEvent) => {
  for (const record of event.Records) {
    try {
      const next = image(record.dynamodb?.NewImage);
      const prev = image(record.dynamodb?.OldImage);
      if (!next) continue;
      // Birth: verify once. Idempotent — a replay sees a non-null status and stops.
      if (record.eventName === 'INSERT' && (next.status === null || next.status === undefined)) {
        const verdict = await verify(next);            // pure decision + the reads it needs
        await graphql(`mutation V($input: UpdateWidgetSubmissionInput!) { updateWidgetSubmission(input: $input) { id } }`, {
          input: {
            id: next.id,
            status: verdict.ok ? 'VERIFIED' : 'REJECTED',
            orgStatusKey: `${next.orgId}#${verdict.ok ? 'VERIFIED' : 'REJECTED'}`,
            verifiedAt: new Date().toISOString(),
            rejectionReason: verdict.ok ? null : verdict.reason,
            computedTotal: verdict.total,
          },
        });
        continue;
      }
      // Later life: react to transitions the server itself made, or to an
      // intent column the client owns (modules.md: desired vs. actual).
      if (record.eventName === 'MODIFY' && prev?.status !== next.status) {
        await onTransition(prev?.status, next.status, next);
      }
    } catch (err) {
      console.error('widgetVerifier: failed', { keys: record.dynamodb?.Keys, err: String(err) });
    }
  }
};
```

What each piece is doing:

- **Model rule: create and read for the submitting role.** No client
  update path, so "every update is checked" is enforced by absence — the
  only updates come from the handler over IAM. If the client must be able
  to edit *its own* columns after submission (fix a typo), give the model
  `update` and rely on the field rules below to keep the lifecycle out of
  reach; the handler then also re-verifies on MODIFY of client-owned
  columns. Prefer the create-only shape; re-verification is where bugs
  live.
- **`status` read-only, nullable, no default.** The row is born with
  `status` null — the submitted state — and the client provably could not
  have said otherwise, because any value in the input is refused. Keep it
  nullable: a required column would need a value at create, which only a
  default could supply, and a default is exactly what breaks the create
  (§3). Read stays granted to every group, so §2.5 sharp edge 5 never
  fires either.
- **Verdict columns read-only.** They exist only after the handler writes
  them. Field rules *replace* the model's rule for that column, so each one
  restates its read grant.
- **The queue key is server-written.** A `${orgId}#${status}` computed key
  (§2.4) backs the verified / rejected lists. Because the client cannot
  write `status`, it cannot write this key either; the handler sets both
  together, so the index never disagrees with the column. Rows still
  awaiting a verdict have no key yet — they are transient (seconds) and a
  screen that must show them lists by `…ByOrg` and filters on null. If the
  product needs a durable "awaiting" queue, the pipeline step in §6 sets
  `SUBMITTED` and the key at birth.
- **Idempotent by construction.** At-least-once delivery means the same
  INSERT can arrive twice; the second time `status` is no longer
  `SUBMITTED` and the handler does nothing. "Already decided" is success.
- **Log and continue** on a bad record so one poison row does not block the
  batch (`adding-a-module.md` §2).

**The client's side of it.** The row appears immediately with `status`
null. Show that honestly ("verifying…"), subscribe to `onUpdate` on the row (its
selection set may include the read-for-all verdict columns), and flip the
UI when the verdict lands. The verification window is about a second on
the stream plus whatever `verify()` reads; it is not zero, and the UI must
not pretend it is.

**Later client-initiated transitions** — withdraw, cancel, request review —
are never writes to `status`. They are writes to an intent column the client
does own (`withdrawRequested: a.boolean()`), and the handler reconciles the
intent into the lifecycle. That is `modules.md` "desired state versus
actual"; the authority is proven by *which* column moved.

## 5. Where it fits

Places already in this shape, for reference: `NewsletterSubscriber`
(public create, the trigger owns `status` and the tokens — the foundation's
own instance), and any media row whose client creates the row and whose
S3 ingest trigger writes `sha256` / `fileValidationStatus` behind
`READ_ALL` (`amplify/data/media-ingest.ts`).

Candidates, by shape:

1. **A computed verdict the client used to write.** A risk tier, a due
   date, a score: anything a browser computed and sent. Make the columns
   `READ_ALL`, keep the pure function the UI previews with, and run the
   same function in a stream consumer on the rows it depends on. The
   client's "mark done" becomes: create the row born unverified; the
   handler validates (references exist, the actor is a member of the org)
   and lands the verdict.
2. **A lock or a seal.** `lockRequested` / `sealRequested` is the intent
   column the client owns; the consumer verifies, snapshots and writes
   `LOCKED` + `lockedAt` or an error column. The audit row is written from
   the same transition.
3. **A submission to an outside system.** The outbound status is
   `READ_ALL` and born `NOT_SUBMITTED`, so a client cannot claim a
   submission that never happened. `submitRequested` is the intent; the
   consumer talks to the outside system and marks `SUBMITTED` only when the
   call is real.
4. **A multi-row request that a command currently expands.** The client
   creates **one** row for the span, born unverified; the handler runs the
   policy check, expands the span by creating the sibling rows itself over
   IAM (no client partial write to roll back), and lands `PENDING` or
   `DENIED` with the reason. The decision becomes an Admin-only intent
   column the same handler applies into the `READ_ALL` decision columns.
   The command that stays is the one that must reject synchronously *and*
   cannot be expressed as a rejected state; that set is usually empty.

Places where this is **not** the right tool, and what is:

| Need | Why not submit-then-verify | Use |
|---|---|---|
| A stamp that depends on **who** wrote (`confirmedBySub`) | A stream record carries no caller identity | APPSYNC_JS pipeline step at request time (built like `amplify/data/record-access/`, installed from `applyVerticalBackend`) |
| A GSI key that must be correct **at write time** for tenancy (`orgStatusKey`) | A stream fills it a second later; the index would briefly serve a client-supplied value | Pipeline step |
| Reject **synchronously**, before any row exists, and a rejected state is unacceptable | The row exists by the time the stream fires | Command mutation (`modules.md` "The exception") |
| Several items must change **atomically** (the Gen 1 wallet transactions) | Neither streams nor generated mutations span items | A custom operation with `a.handler.custom(...)` issuing `TransactWriteItems` — the Gen 2 home for what `resolvers/*.vtl` did in Gen 1 |
| The caller has **no Cognito token** (webhook, device) | No AppSync mutation to put the row in | Inbound HTTP (`modules.md`) |

## 6. Request-time checks in Gen 2: the pipeline step

Gen 1's other half — "some fields were checked for their value on every
update" in a VTL request template — has no override slot in Gen 2, but the
platform already has the replacement: an APPSYNC_JS function inserted into
the generated resolver's pipeline just before Amplify's data step. Two
foundation instances exist (`entitlements/`, `record-access/`), both
created in the nested stack that owns the data source table
(`docs/adding-a-module.md` → Gotchas for why); a product installs its own
from `applyVerticalBackend` (`amplify/data/vertical.ts`). Reach for one when the
check must run **before** the write, must see the **caller's identity**,
or must **compute a value the write itself needs**. Reach for the stream
handler when the check needs facts from other rows, may take time, or
should retry. Most lifecycles want the stream; a few columns want the step;
none want a VTL override.

## 7. Applying it: the checklist

1. Decide the lifecycle enum. `status` is `READ_ALL`, nullable, **without**
   a `.default()` — null is the born-unverified state. A default on a
   read-only column fails every client create (§8). Need a literal value at
   birth? Force it in a pipeline step (§6), not a default.
2. Mark every column the verdict produces `READ_ALL`. Restate read on each.
3. Model rule: `create` and `read` for the submitting role; add `update`
   only if the client must edit its own columns, and then re-verify on
   MODIFY.
4. Add the `${orgId}#${status}` queue key (`READ_ALL`, handler-written) and
   its GSI.
5. Write the stream consumer: INSERT + `SUBMITTED` → verify → verdict;
   MODIFY → react to transitions; idempotent on `status`; log and continue.
   Export it in `<id>Functions` and `<id>StreamConsumers`; spread into
   `verticalFunctions` / `verticalStreamConsumers`.
6. Put the pure decision in `modules/<id>/lib/` with tests; the handler
   imports it by relative path and does the reads.
7. Client-initiated later transitions go through intent columns, never
   `status`.
8. `npm run check:backend` (synth + cycle scan), `npm test`, deploy the
   sandbox, then prove it: create a row from the app, watch `status` flip
   in the sandbox table, and try to create one with `status: 'VERIFIED'`
   — AppSync must refuse it.

## 8. Gotchas carried over from Gen 1, and new ones

- **Defaults are applied before field auth — verified, not assumed.** In
  the synthesized pipeline for a create with a defaulted `state` column the
  order is `init0` (id, timestamps) → `init1` → `auth0` → … → data step,
  and `init1` is literally
  `$util.qr($context.args.input.put("state", $util.defaultIfNull($ctx.args.input.state, "PENDING")))`.
  `auth0` then builds `$inputFields` from `$ctx.args.input.keySet()`, adds
  each matching group's `allowedFields` (that list omits every `READ_ALL`
  column), and errors with `Unauthorized on ${deniedFields}` if any input
  key is not allowed. So `.default()` on a read-only column turns every
  Cognito create into that error; it only works when every creator is a
  Lambda. The `WidgetRequest` sketch that used to be in `docs/modules.md`
  had the same bug on paper and is fixed. Rule: read-only lifecycle
  columns are nullable with no default; a literal born value comes from a
  pipeline step.
- **Lambdas bypass everything.** In Gen 1 the IAM rule was per model; in
  Gen 2 `allow.resource` makes the Lambda a transformer admin. It can write
  any column of any row in any org. The handler's tenancy is the row's own
  `orgId` from the stream image; never trust a foreign key on the image to
  point into the same org without checking the target row.
- **Field rules replace model rules** for that column (`§2.5` edge 1).
  Forgetting the read grant on a verdict column silently hides it from
  everyone.
- **A denied field returns `null` plus an error**, not a clean omission
  (edge 2). A client that includes `status` in a create input gets a
  GraphQL error, which is the desired behaviour; make sure the client never
  sends it by accident.
- **Streams are ordered per shard, not per table.** Two rows' events can
  interleave; one row's events arrive in order. Design the handler around
  one row at a time.
- **At-least-once.** Idempotency on `status` is not optional.
- **The verification window is real.** A `SUBMITTED` row is visible to
  list queries immediately. Filter by the queue key where a half-verified
  row would mislead (dashboards, exports).
- **No caller identity on the stream.** Anything that must record *who*
  is stamped at request time (§6) or denormalized by the client into an
  actor column that a field rule lets only that caller's role write.
