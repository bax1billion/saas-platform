# Reviewing a pull request

How the lead and an agent session review a pull request before it merges.
`CLAUDE.md` points here; the rules themselves live in `CLAUDE.md`,
`docs/modules.md`, `docs/core-data-model.md`, `docs/data-coupling.md` and
`docs/submit-then-verify.md`. This file is the order of work and the
checklist.

The agent's part of this review runs in CI on every PR that is ready for
review (`.github/workflows/claude-review.yml`, prompt
`.github/claude/review-prompt.md`), beside the conventions, coverage, secret
and dependency checks in `docs/pull-request-gates.md`. A Tier 2 PR merges on
its own when they are green; a Tier 1 PR waits for the lead, who reviews it
the way this file says, in a worktree, and approves on GitHub. The machine
does § 2 and the first read of § 3 before a person opens the worktree, and
the lead's time goes to Tier 1.

## 0. The standard

A PR merges when it is **right**, not when it is close. Three tests, in this
order:

1. **Architecture.** It follows the platform's shape: tenancy on every row,
   one owning module per table, server-authoritative rules where a rule must
   hold, commands only where a request must be refused before any write,
   events across modules, the export service for documents, the notify seam
   for anything that leaves the organization.
2. **Conventions.** It follows the repo's documented conventions, not a
   brief's or the developer's habits. Where the docs and the code disagree,
   code wins, and the doc gets fixed in the same PR.
3. **Tooling.** It stays on native AWS services (Amplify Gen 2, AppSync,
   DynamoDB streams, Lambda, S3, SES, Step Functions) and open-source
   libraries already in the tree. A new dependency needs a reason the
   existing ones cannot give.

**Nothing merges with a known gap.** If the review finds a rule that only
the screen enforces, a shared row written from the client, a test that
checks names but not columns, or anything else the conventions forbid, the
review fixes it in the PR. "Recorded as a follow-up" is for work the PR did
not set out to do, never for a violation the PR introduces or leaves. The
changelog entry says what was fixed, not what was kept.

**Tier 1 needs a person.** Sign-in, sessions, permissions, the foundation
schema, anything that sends outside the organization, production releases
and deletes, a removed or shared test, and whatever else `CLAUDE.md` "Tier 1
review" names for this repository: the agent reviews and fixes, the lead
signs off personally. Say which tier the PR is in the handover.

## 1. Set up

One worktree per PR, next to the main checkout, so two reviews never share a
working tree:

```bash
git fetch origin
git worktree add ../<repo>-pr<N> <pr-branch>   # checks out the PR's own branch, tracking origin
cd ../<repo>-pr<N>
npm ci
cp ../<repo>/amplify_outputs.json .            # or echo '{}' > amplify_outputs.json
```

The worktree is on the PR's branch under its own name, so the review commits
push to the PR with a plain `git push` and the PR itself updates; a review
branch of another name makes a second PR. The main checkout never has a PR
branch checked out, so the worktree may take it.

Install for real: a `node_modules` symlinked from another worktree is enough
for tests and type checks but Turbopack refuses it ("Symlink node_modules is
invalid, it points out of the filesystem root") and `next build` fails.

Then, before reading a line of the diff:

```bash
git merge origin/main             # the PR must target the default branch; retarget it if it does not
git diff origin/main --stat       # review against the base, not against the PR's old base
```

Work that looks new in the PR may already be on the base. Resolve conflicts
with the frame and the conventions in mind: a PR written before a frame
change must adopt the frame's current pieces.

## 2. Run what CI runs, first

```bash
npm test
npx tsc --noEmit
npx tsc --noEmit -p amplify/tsconfig.json
npx eslint . --max-warnings=0
npm run check:backend
npx next build
```

Run them before the read: a PR that does not pass them is not ready for a
design review, and the failures often point at the design problem.
`check:backend` prints the gated-mutation count and the cycle scan; note
both numbers for the changelog. Read to the end of its output: the
resource-cap error comes after "synth OK".

## 3. Read in three passes

Fan out when the PR is large (one agent per pass, in parallel); do all three
yourself when it is small. Each pass has its own questions.

**Backend (schema, Lambdas, pipeline steps).**
- Every model: `orgId` required, a `...ByOrg` index, no
  `belongsTo('Organization')`, module-prefixed name, `sortDate` on
  chronological indexes. One GSI per real access pattern; no index for a
  query nobody makes, no scan for a query somebody does.
- Authorization: who may create, update, delete. A column the client must
  not write is a field rule or the model has no client `update` at all; a
  rule the client could walk around with a direct mutation is a hole,
  whatever the screen does.
- Field rules mean never sending `id` on a create and no `.default()` on the
  ruled columns. Check both.
- Entitlements: every new table is in the module's stream-tables list and
  every command in `verticalModuleMutations`; a foundation command is in
  `subscriptionMutations`. A table or command missing there is an ungated
  side door into a paid module.
- Commands: only where a request must be refused before any write. The
  handler resolves the caller from the Cognito sub to a User row and its
  org, treats another org's row as not found, writes with a condition on
  the state the decision was made against, and keeps the rule in a pure
  `modules/<id>/lib/` file the client store can share. Names on records come
  from the User row, never the email.
- Streams: idempotent, no caller identity, re-reads the live row before
  acting on a replayed record.
- AppSync caps a resolver at 30 s and a pipeline at 10 functions. A command
  timeout above 30 s is a design error (move the work to a stream consumer
  with a claim), and a gated model with field rules is near the function
  cap already.
- Resource counts: a module's tables each add stream plumbing and each
  command adds a function with its role and policies; CloudFormation caps a
  stack at 500 resources and CDK fails the synth past it, after
  `check:backend` has printed "synth OK". Read the whole output, and count
  the data stack's template when a PR adds tables or functions.
- Shared foundation models (`Organization`, `User`, and the hubs a product
  declares): written through platform commands with a dedupe rule, extended
  in module tables keyed by the shared id, never given a module-only column.
- Cross-module: no `a.ref` into another module's models, no import from
  another module, events into the owner's stream handler for effects.
- Scale: reads bounded by org and date or by the row's own index, never
  "load the whole org and filter". Design for a large tenant, not the seed.
- Documents and exports go through the export service (`ExportJob`,
  providers, `queueExportJob`); outbound messages through `dispatch()`.

**Client stores and data adapters.**
- Server-minted ids are re-keyed in memory and in every queued write that
  names the old id; a child write never goes up before its parent's create
  has answered.
- Optimistic rules use the same pure module the command uses, then await
  the command and commit the row the server returned.
- A refused write is reported inline and the org's rows are reloaded; no
  silent divergence between screen and server.
- Lists load headers and fetch detail per record; never the whole org's
  history on mount when the module will have years of it.

**Screens and docs.**
- No new `toast(` call or sonner import in a changed screen; a control
  changes real state, shows an honest empty state, is hidden, or says what
  is missing inline. Confirmations are the state itself where it is visible.
- Three doors (`docs/shell.md`): Field targets and sizes through the theme
  tokens (`text-field`, `min-h-target`, `min-h-primary`; a pixel literal
  fails `lib/field-floor.test.ts`), Station keyboard and review, Admin
  switches. The app frame owns the chrome (`useDoor()`); a product never
  draws its own sidebar or door switch.
- A control that can only fail for the viewer's group is hidden or disabled
  for that group.
- No real customer, person or address anywhere; never regulated or personal
  data in code, seed, tests or logs.
- `docs/<id>-module.md` matches the code it describes; the
  `docs/<id>-changelog.md` entry for this review is written in the PR.

## 4. Fix, then verify

Fix what the passes found in the worktree. Tests for every rule you changed
(`*.test.ts` next to the code). Then run the full set in § 2 again. Nothing
that only synth has seen counts as working: say plainly in the changelog and
the handover what has not run against a sandbox.

If a fix changes a Next route segment config or anything else that the
build reads as a literal, run `next build` again after the last edit.

## 5. Hand over

In a review session the lead makes every commit (never run `git commit` or
`git push` in the session). Leave the worktree in two layers so the merge
stays reviewable:

- **Index:** the pure merge of the base into the PR branch, with conflicts
  resolved and nothing else.
- **Working tree:** the review fixes, also saved as `../pr<N>-review.patch`
  (`git diff > ../pr<N>-review.patch`).

Then give the commands: the merge commit, the review fixes split by concern
(`foundation:` for anything generic, with the product-word grep; `<module>:`
per module; `docs:` for a playbook or a convention), and a plain `git push`,
which updates the PR because the worktree is on the PR's own branch (§ 1).
The handover message says: what the PR does, what was found and fixed, what
tier it is in, what has not run against a sandbox, and the numbers from
`check:backend`.

In a product mirror, a fix that is foundation-generic (a seam, an export
format, a trigger version) is noted for upstreaming to this repository.

## 6. Findings that recur

The things reviews have found more than once; check them first.

- A rule enforced by the screen only (self-approval, a state order, a lock).
  The fix is a command with the rule in a pure module.
- A shared foundation row created from the client. The fix is the platform
  command with the dedupe inside it.
- `id` sent on a create of a field-ruled model. The fix is server-minted ids
  and a store that re-keys.
- A Cognito trigger wired as version 1 while the data client sends the
  access token. The fix is the V2 attachment in `backend.ts`.
- A command that needs more than 30 s. The fix is a stream consumer with a
  claim, not a bigger timeout.
- A per-module export mechanism. The fix is the export service.
- A computed id with the org inside it used as a key, where a `...ByOrg`
  index would do. Keep the convention; the computed key is for a unique
  lookup only.
- Toasts as the only outcome of a control.
- Contract tests that check names, not columns.
- A resource moved between CloudFormation stacks to make room. Create runs
  before delete, so anything unique per target (an event source mapping per
  stream and function) collides with its old self. Move the resources
  nothing else is unique on, keep the rest in place.
