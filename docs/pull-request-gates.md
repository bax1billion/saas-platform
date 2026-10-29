# The pull request gates

How a pull request gets from "opened" to "merged" in this repository and in
every product mirror of it, with as little of the lead's time as the change
needs. Product work merges on its own when the machine says it is right;
changes to the foundation wait for a person. This file is the design, the
runbook and the list of settings a person applies once.

The shape, in one paragraph: CI runs the tests, the typechecks, lint, the
backend synth and the production build. A second workflow holds the repo's
conventions as a check, decides whether the PR needs a person (Tier 1), scans
the commits for secrets and audits the dependencies. A third runs Claude Code
as a reviewer that posts a thread only for a blocking finding, answers the
other readers' threads, and classifies the PR by what it does. A fourth turns
on GitHub's auto-merge for every PR that is ready. The rulesets, kept as files
and applied with the API, make the checks required and say who may bypass. A
small Lambda in each hosting account reports the Amplify Hosting deploy back
to the commit.

## 0. The split

**Tier 2, merges on its own:** product work on a module: its screens, its
pure logic under `modules/<id>/lib/`, its thin routes, its own schema file
(`amplify/data/modules/<id>.ts`) and its own Lambdas, its published contract
under `lib/services/<id>/`, its own tests edited beside its code, its spec and
changelog; shared UI under `components/`, the theme tokens, the map engine
and the other helpers under `lib/` that are not foundation; copy and docs that
are not rulebooks. Every check green, the AI review with no blocking finding,
every review thread resolved.

**Tier 1, a person signs off:** the foundation backend (the schema in
`amplify/data/resource.ts`, auth, entitlements, record access, the data
domains, the shared services, the foundation Lambdas, CDK), the app frame, the
entitlement decision and the other foundation code under `lib/`, the registry
and prices in `config/`, the build and the gates themselves, a dependency,
legal text, the rulebooks; a test removed or a shared test edited; a module
schema that adds a public, guest or authenticated rule; a module Lambda that
reaches outside the organization; and anything the AI review classifies as
Tier 1 by what it does. A product adds its own categories in its `CLAUDE.md`
(regulated data, money, anything with legal weight) and the review reads them
from there.

The split was once wider, holding all of `lib/`, `components/`, `config/`,
every schema file, every Lambda and every edited test. In the first week it
held nearly every product PR for the lead on a shared path or on a module's
own test, which is the opposite of what the gates are for. Hold what a
mistake in would hurt everyone; release what the review can read.

## 1. The gates, one by one

Every gate is a GitHub check with a plain name. The ruleset (§ 5) makes them
required on the default branch; a PR cannot merge while one is red.

| Check | Workflow | Enforces |
|---|---|---|
| `checks` | `ci.yml` | `npm run test:coverage` (the suite plus the coverage floors, § 3), `tsc` for the frontend and for `amplify/`, `eslint` at zero warnings (the module import boundaries), `check:backend` (local CDK synth, cycle scan, template caps) |
| `build` | `ci.yml` | `next build`, so the Hosting build is never the first to run it |
| `conventions` | `pr-gates.yml` | § 2 |
| `tier-1 review` | `pr-gates.yml` | red while a Tier 1 PR waits for a lead's approval; labels the PR `tier-1` and explains why in one comment it keeps editing |
| `secret-scan` | `pr-gates.yml` | gitleaks, pinned by version and sha256, proved against a token shaped at run time, over the commits the PR adds |
| `dependency audit` | `pr-gates.yml` | `npm audit` on production dependencies: a critical advisory fails; high and below are listed in the job summary and left to Dependabot's weekly PR |
| `claude-review` | `claude-review.yml` | § 4 |
| CodeQL | GitHub default setup, when enabled | a code scanning rule in the ruleset fails a PR that introduces a high or critical alert (not in the shipped ruleset file; § 7) |

Plus GitHub's own, all repository settings: secret scanning with push
protection, Dependabot alerts and security updates, Copilot code review.

Two workflows that are not checks: `auto-merge.yml` flips the auto-merge
switch (§ 5) and `deploy-status.yml` records the deploy (§ 6).
`update-branches.yml` brings queued PRs current on request (§ 5).

## 2. The conventions check

`scripts/pr-gates/check.mjs --mode conventions`: pure rules in
`scripts/pr-gates/rules.mjs` with tests in `rules.test.ts`, the facts gathered
from `git` and `gh`. Runs without `npm ci`. What fails it, each with the
CLAUDE.md line it comes from and the fix in the message:

- The PR does not target the default branch. The one exception is the
  promotion of the default branch into the release branch, when the
  repository has one (`scripts/pr-gates/local.mjs`). A PR based on another
  feature branch is refused: one change, one branch, one PR. Branch names and
  PR titles are not checked; they are a habit, not a gate.
- A commit subject is not `<area>: <imperative subject>` (merges, reverts and
  Dependabot's `chore(deps):` pass).
- A `foundation:` commit adds a line with a product word (`PRODUCT_WORDS` in
  `local.mjs`; empty in the foundation itself).
- A file that never ships is in the diff (`amplify_outputs*`, `.env*` except
  the example, `amplify/.sandbox-operators`, `*.pem`).
- A changed screen adds a `toast(` call or a sonner import. A control changes
  real state, shows an honest empty state, is hidden, or says what is missing
  inline; a message is never the only outcome. The Toaster itself is exempt;
  a line that must, says `toast-ok:` and why.
- A changed file under `app/`, `components/`, `lib/`, `modules/` or `config/`
  adds a hex colour outside `config/theme.css`. A standards catalog that must
  carry fixed colours is exempt by path in `rules.mjs`; elsewhere `hex-ok:`
  and why.
- Module work (`modules/<id>/`, `app/(app)/<id>/`, the module's schema or
  Lambdas) with no change to `docs/<id>-changelog.md`, `docs/<id>-module.md`
  or `docs/<id>-design.md`.
- Logic changed with no test added or updated anywhere in the PR. Logic is
  `modules/*/lib/**`, `lib/**`, the APPSYNC_JS steps under `amplify/data/`,
  `amplify/functions/*-shared/**` and `amplify/shared/**`; `types.ts`,
  `index.ts`, schema files and Lambda entry points are not counted.

Only the lines a PR adds are read for the toast and hex rules, so existing
violations are cleaned as their screens are touched, not in one sweep.

The same script in `--mode tier` decides Tier 1: an owned path in
`.github/CODEOWNERS` (read from the base branch, as GitHub reads it, so a PR
cannot release its own paths by editing the file), a removed test, an edited
test outside the module whose code the PR changes, a public, guest or
authenticated rule added to a module schema, an outbound SDK or `fetch`
added to a module Lambda, or the `tier-1-by-review` label the AI review
adds. A lead's approval turns the check green without a new push: the
workflow also runs on review events. The latest decisive review per lead
counts, so an approval withdrawn by a later "changes requested" no longer
releases the PR.

Run it before opening a PR: `npm run check:pr` reads the PR of the current
branch through `gh`.

## 3. Coverage floors

`vitest.config.ts` measures line coverage over the pure-logic directories and
holds a floor per family. The floors are a ratchet: set a little under what
the tree has when they are introduced, they may go up when coverage does and
never down in the same PR that lowers it. Lowering one is a change to a test:
Tier 1, with the numbers in the PR. Screens (`.tsx`), schema files, Lambda
entry points and generated code are not measured; synth, the typecheck and
the build are their checks. CI prints the totals in the job summary.

## 4. The AI review

`claude-review.yml` runs Claude Code on every PR that is ready for review (a
draft is not reviewed until it is marked ready; `@claude review` in a comment
asks for one at any time). The prompt is `.github/claude/review-prompt.md`:
read the playbook's three passes and recurring findings
(`docs/playbooks/reviewing-a-pr.md`), read the diff against the base, check
the repo's run-time gotchas, classify the tier by content, post one inline
comment per **blocking** finding, one summary as a review comment that lists
the blocking and the advisory findings, and return a structured result
(`.github/claude/review-schema.json`). The check fails on a blocking finding.
A Tier 1 classification adds the label `tier-1-by-review`, which the
`tier-1 review` check reads; a Tier 2 verdict removes it. The review
classifies by what the change does, never by its paths (CODEOWNERS holds
those) and never by the words it mentions, otherwise the label doubles every
path hold and lands on a copy change for using a loaded word.

Blocking is what the playbook says nothing merges with: a rule only the
screen enforces, a hole a direct mutation could walk through, a table or
command outside the entitlement gate, a cross-module write or import, a
foundation model given a module-only column, a message-only control, logic
without a test, real-world or regulated data, a secret, a send outside
`dispatch()`, a Field control below the floors (48 px target, 54 px primary,
17 px text, by a literal or by a shared component's default size such as
`Button`'s 36 px), a convention broken without the PR saying why.

**Threads.** An inline comment is a review thread, and the ruleset requires
every thread resolved before a merge, so the review posts a thread only for a
blocking finding. Advisory findings live in the summary, where the author
reads them without anyone having to click resolve. The review also reads
every unresolved thread before it writes its own: Copilot's, its own from an
earlier push, a person's. A bot's thread it confirms as blocking gets a
`**Blocking.** confirmed` reply and counts in the verdict; one it finds
advisory or wrong gets a one-line reply with the reason and is resolved. A
person's thread is never resolved by the review; it replies and leaves it.
The fix path resolves the bot threads it fixes.

**Order.** Copilot's automatic review (a ruleset GitHub makes when the
setting is turned on: at open, drafts included, not on push) usually lands
within a few minutes of the PR opening. `claude-review.yml` waits for it
while the PR's timeline shows Copilot asked and not yet answered, up to ten
minutes, so the review sees Copilot's threads and answers them in the same
pass. Copilot's request shows only on the issue timeline, not in the
`requested_reviewers` endpoint. A PR opened as a draft, as the convention
says, has Copilot's review long before it is marked ready.

Getting a fix made, three ways, from least to most automatic:

1. The author fixes it and pushes; the review runs again.
2. Anyone with write access comments `@claude <what to do>` in the PR's
   conversation (`claude.yml`; a conversation comment, not an inline review
   comment, so a reviewer bot's inline comments never start a run). Claude
   edits, runs the checks, commits with the repo's convention and pushes to
   the PR branch. The push has to start the checks again, and a push made
   with the workflow's own token does not: GitHub creates the runs and holds
   every one for a person's approval. Both fix paths therefore push with the
   automation App's token (§ 7 step 6), and their checkout step sets
   `persist-credentials: false`: without it the checkout leaves
   `GITHUB_TOKEN` in the git config as an Authorization header, which wins
   over the token the action puts in the remote URL, and the push still
   arrives as `github-actions[bot]`. If a run is ever held, approve it with
   `gh api -X POST repos/<owner>/<repo>/actions/runs/<id>/approve`.
3. The PR carries the `auto-fix` label (added before or after the review):
   when the review holds it, the `claude-fix` job runs
   `.github/claude/fix-prompt.md` once, pushes, and the review runs again on
   Claude's push. One fix per human push, never a force-push, never a change
   to a test's expectations; a finding that needs a decision is left and
   named. Adding the label to a held PR starts a round at once.

Both prompts are CODEOWNERS-held: a change to what the review enforces is a
change to a test.

Model: `claude-opus-5-5`, capped at 120 turns for a review and 250 for a
fix. Cost: a review is $0.25 to $5 of tokens and five to ten minutes of
runner time; the fix path more. The `ANTHROPIC_API_KEY` secret funds it
(§ 7). Without the secret the check reports a warning and is skipped, which
the ruleset counts as passing, so the secret goes in before the ruleset
makes the check required. When the key's workspace hits its spending limit,
every run fails in under a second with one turn, zero tokens and "no
structured output"; the action's log never prints the API error, so that
pattern means the Anthropic Console, not the prompt.

Copilot code review stays on as a second reader. It cannot fail a check; its
threads block the merge until the review or a person answers them. Its
review events start a `PR gates` run that GitHub holds for approval
("action required": Copilot has no write access); those runs produce no
checks and change nothing. They are noise in the Actions list, not a gate.
Copilot can also resolve merge conflicts: a comment "@copilot Merge in
<base> and resolve the conflicts" starts the Copilot coding agent, which
pushes a merge commit. That push switches auto-merge off (GitHub does so for
a push by an account without write access); re-arm it with
`gh pr merge <n> --auto --merge`. Copilot's comments that mention `@claude`
start `claude.yml` runs that sit waiting for approval; leave them.

## 5. Merging

**Auto-merge.** `auto-merge.yml` turns on GitHub's auto-merge for every PR
to the default branch that is ready for review and not labelled `hold`, and
turns it off again when `hold` is added. GitHub then merges (merge commit)
the moment every required check is green and every required review is in.
Draft means not ready. Dependabot's PRs are included for patch and minor
bumps; a major is left for a person. The switch is flipped with the
automation App's token (§ 7) because a merge made on behalf of the workflow's
default token does not start the push-triggered workflows on the base
branch; until the App exists it uses the default token and says so in the
log. The switch arms nothing while the base branch has no ruleset requiring
status checks: without one, `gh pr merge --auto` merges at once, and two
dependency bumps landed on an unprotected default branch that way, one with
a failing install, minutes after the workflow arrived. Apply the ruleset
(§ 7 step 4) before anything else. GitHub does not re-evaluate auto-merge after a ruleset change or a
rerun of a check by itself; switching auto-merge off and on
(`gh pr merge <n> --disable-auto; gh pr merge <n> --auto --merge`) makes it
look again.

**Up to date with the base.** GitHub's merge queue tests each PR against the
base it will land on; it is available on every plan for a public repository
and on Enterprise for a private one. Without it, the ruleset does **not**
require a PR to be up to date (`strict_required_status_checks_policy` is
false): a PR merges when its own checks are green, and CI on every push to
the base branch plus the deploy result (§ 6) catch a bad combination of two
green PRs within minutes. The strict rule was tried with thirty PRs open:
every merge put the other twenty-nine behind, each update reran CI, the
gates, CodeQL and the AI review on all of them (about 20 Actions minutes and
$0.25 to $5 of review per PR), and only one PR could land per round. Thirty
merges would have cost on the order of 18,000 Actions minutes. The updater
stays as a manual workflow (`gh workflow run update-branches.yml`) for when
a batch of PRs should be retested against today's base before it lands; it
uses the automation App's token because a branch updated with the
workflow's default token does not start the checks.

**Dependabot** (`.github/dependabot.yml`): weekly, one grouped PR per family
(AWS, Next and React minors, tooling, everything else), majors of Next,
React and Amplify ignored on purpose. `package.json` is CODEOWNERS-held, so
each grouped PR waits for the lead's approval and then merges on its own.

**Rulesets as code.** `.github/rulesets/main.json` is the default branch's
ruleset in GitHub's export format: zero approving reviews in general, a code
owner's approval when a CODEOWNERS path changed, stale approvals dismissed on
push, every review thread resolved, the seven checks green, merge commits
only, strict off. Its bypass actor is the repository's admin role; a product
names its lead's user id instead. Create it once and re-apply after a change:

```bash
gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/main.json          # first time
gh api repos/<owner>/<repo>/rulesets --jq '.[] | "\(.id) \(.name)"'                       # its id
gh api -X PUT repos/<owner>/<repo>/rulesets/<id> --input .github/rulesets/main.json       # after a change
gh api repos/<owner>/<repo>/rules/branches/main                                           # what is live
```

`release.json` is the template for a product with a promotion branch (a
`staging` default branch promoted to `main`): one approval on the last push,
the CI checks strict, and the `update` rule, which refuses every push and
merge except by a bypass actor, so a PR to that branch is merged by the lead
and by no one else, whatever approvals it has. Auto-merge can still be
switched on for such a PR by anyone with write, but the merge it attempts is
refused and GitHub switches it off again. Rename the ref before applying and
set `RELEASE_BRANCH` in `scripts/pr-gates/local.mjs` so the conventions
check knows the promotion PR's shape.

**Workflow concurrency.** Each workflow cancels its own older runs for the
same PR, and the group includes the event name. Without that, the AI
review's summary (a `pull_request_review` event two to five minutes after a
push) cancelled the push's gates run, the head kept cancelled `conventions`
and `secret-scan` check runs, and PRs sat blocked with every other check
green. The REST check-runs endpoint hides cancelled runs by default
(`filter=latest`); the GraphQL `statusCheckRollup` shows them.

## 6. The deploy result in GitHub

Amplify Hosting builds a branch after a merge and does not tell GitHub how
it went. The loop is closed in three small parts:

1. **In each hosting account:** an EventBridge rule on
   `{"source":["aws.amplify"],"detail-type":["Amplify Deployment Status Change"]}`
   invokes `scripts/deploy-status/handler.mjs` (Node 22; the AWS SDK ships
   with the runtime). It reads the job's commit with `amplify:GetJob` and
   sends a `repository_dispatch` event `amplify-deploy` to the repository
   with `{ appId, region, branch, jobId, status, commitId, consoleUrl }`
   (`payload.mjs`, tested). It needs `GITHUB_REPOSITORY` and a fine-grained
   token on the one repository with Contents read and write, kept in Secrets
   Manager (`GITHUB_TOKEN_SECRET_ARN`). This Lambda lives outside the Amplify
   backend on purpose: it must report the deploys that fail.
2. **`deploy-status.yml`** turns the event into a GitHub Deployment in an
   environment named after the branch (`production` for `main`) with its
   status, a commit status `amplify/<branch>` on the merged commit, and on a
   failure an issue `Deploy failed on <branch>` labelled `deploy-failed`,
   closed again by the next success.
3. **A release gate (optional).** With deployments recorded, a release
   branch's ruleset can require a successful deployment of the commit being
   promoted ("Require deployments to succeed"), and a browser test job can
   run against the deployed branch right after each deploy.

To create the pieces in an account, once per hosting account, by a person
with that account's CLI profile: `scripts/deploy-status/deploy.sh`. It is
idempotent (run it again to update the code, the token or the branches) and
makes the secret, the role, the function, the rule and the invoke
permission, all named `amplify-deploy-status`.

1. Make a GitHub fine-grained token: Settings, Developer settings,
   Fine-grained tokens; repository access only this repository; repository
   permissions Contents: Read and write (the one permission
   `repository_dispatch` needs); expiry one year. Save it to a file outside
   the repo and delete the file after the run.
2. Find the app id: `aws --profile <profile> --region <region> amplify list-apps --query 'apps[].[name,appId]' --output table`.
3. Run:

```bash
scripts/deploy-status/deploy.sh --profile <profile> --region <region> --repo <owner>/<repo> \
  --app-id <app id> --branches main --token-file <path to the token>
```

4. Merge something and watch the function's log
   (`aws logs tail /aws/lambda/amplify-deploy-status --follow`): one `sent`
   line per status change, and the commit on GitHub shows the
   `amplify/<branch>` status and the deployment.

The event's `detail` fields are `appId`, `branchName`, `jobId`, `jobStatus`;
confirm against the first real event in the function's log before trusting
the mapping (a `skipped` line with an empty branch means the field names
differ). PR previews (a build per PR) are not an option for a backend of
this size: a fresh stack exceeds CloudFormation's 2,500-resource operation
cap (`docs/bootstrap.md`).

## 7. Settings a person applies

In order. Each line is one action in GitHub or the Anthropic Console, by an
organization owner or a repository admin.

1. **Actions billing** (private repositories only; public ones are free).
   Organization settings, Billing: raise the Actions spending limit from
   zero. With these gates a PR costs about 20 runner minutes (CI's two jobs
   in parallel, the gates in seconds, the AI review five to ten).
2. **Secrets and variables** (repository settings, Secrets and variables,
   Actions): `ANTHROPIC_API_KEY` (an API key from the Anthropic Console on a
   workspace with a spending limit that fits the expected review volume:
   thirty reviews and fixes in two hours hit a small one), and the
   automation App's `AUTOMATION_APP_PRIVATE_KEY` secret and
   `AUTOMATION_APP_ID` variable (step 6). Without the App an auto-merged PR
   does not start CI or the secret scan on the base branch, and every push
   Claude makes to a PR waits for a lead to approve its runs.
3. **Repository settings, General, Pull Requests:** allow auto-merge (on);
   automatically delete head branches (on); merge commits allowed.
4. **Rulesets.** Apply `.github/rulesets/main.json` (§ 5) as the first
   setting after the workflows land: until it exists nothing requires a
   check, so auto-merge would merge at once (the workflow refuses to arm
   until then) and Dependabot's first PRs arrive within minutes of its
   config. The check names can be required before they have ever reported;
   each PR's run creates them. Verify on a
   test PR that touches `lib/modules/` that GitHub asks for the code owner
   and that a PR touching only a module's directory does not.
5. **Roles.** The lead is admin; other accounts that open PRs are `write`.
   Rulesets apply to admins unless they are bypass actors, so the hold works
   either way. Organization: require two-factor authentication.
6. **A GitHub App for automation** (for `update-branches.yml`, the
   auto-merge switch, and Claude's pushes from `claude.yml` and the
   `claude-fix` job): Organization or account settings, Developer settings,
   GitHub Apps, New. No webhook; repository permissions Contents read and
   write, Pull requests read and write, Issues read and write (Claude's
   comments and labels); install on this repository only. Put the App ID in
   the `AUTOMATION_APP_ID` variable and a generated private key in the
   `AUTOMATION_APP_PRIVATE_KEY` secret, then delete the key file. From then
   on Claude's pushes and comments on a PR appear under the App's name and
   its pushes start the checks on their own. A lost key is replaced from the
   App's page (generate a new one, set the secret, delete the old one).
7. **The Claude GitHub App** (`github.com/apps/claude`) installed on the
   repository, which the Claude Code Action needs for its inline comments.
8. **Copilot code review** (repository settings, Rules, or the Copilot
   settings): automatic review on new pull requests, drafts included. The
   AI review waits for it and answers its threads (§ 4).
9. **CodeQL** default setup (Security, Code scanning). Once it has reported
   on a PR, add a `code_scanning` rule to the ruleset file and re-apply:
   `{"type":"code_scanning","parameters":{"code_scanning_tools":[{"tool":"CodeQL","security_alerts_threshold":"high_or_higher","alerts_threshold":"errors"}]}}`.
10. **Labels** are created by the workflows on first use: `tier-1`,
    `tier-1-by-review`, `auto-fix`, `hold`, `deploy-failed`, `dependencies`.
11. **Deploy status** (§ 6), once per hosting account.
12. **Actions policy** (repository settings, Actions, General): keep "Allow
    all actions"; consider "Require actions to be pinned to a full-length
    commit SHA" once Dependabot has rewritten the `uses:` lines.

## 8. Known failure modes

Each of these happened once and is now designed around; the symptom is
listed so the next person recognises it.

- **Every Claude run fails in under a second** with one turn, zero cost and
  "no structured output": the API refused the first call. Spending limit,
  credits or the key. The Anthropic Console has the answer; the action's log
  does not.
- **A PR is blocked with every check green and no open thread.** Look at
  the GraphQL `statusCheckRollup` for cancelled check runs on the head (a
  concurrency cancellation that was never rerun), and at `mergeable_state`:
  `clean` means auto-merge needs the off-and-on nudge (§ 5).
- **Claude's push started runs that sit "action required".** The push went
  out as `github-actions[bot]`: the App token is missing, or the checkout
  persisted its credentials (§ 4). Approve the held runs by their id and fix
  the cause.
- **The AI review did not run on a PR that changes `claude-review.yml`.**
  The Claude Code Action only runs a workflow identical to the default
  branch's; the Verdict step says so and passes. That PR is CODEOWNERS-held,
  so a person reviews it.
- **Auto-merge switched itself off** after Copilot or another account
  without write access pushed to the branch (§ 4).
- **The Tier check held a PR on a path the base branch's CODEOWNERS had
  released.** Before the check read CODEOWNERS from the base, it read each
  head's copy, so a narrowing merged to the base applied to a PR only after
  the branch was updated.
- **A review-event run cancelled the push's run** (§ 5, concurrency).
