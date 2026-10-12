# Bootstrapping an environment in stages

How a new environment (a sandbox, a new branch's account, production) is
created from this backend once the lineup has grown, and why it cannot be
done in one deploy. Design record and the cap it answers:
`docs/data-domains.md` § 9.

## The cap

CloudFormation allows one stack operation (create, update or delete) to
touch at most 2,500 resources across the root stack and every nested
stack. It is a documented quota and not adjustable. Every model is a
nested stack of about 45 resources, so a backend of 130 models synthesizes
to about 6,800 and a from-scratch deploy fails with "Limit on the number
of resources in a single stack operation exceeded" before any template's
own 500-resource or 1 MB cap matters. An environment that grew by updates,
each touching a few hundred resources, never sees it; any environment
created from scratch does (a product's sandbox account, 2026-10-10).

The number that matters for a deploy is what it creates, changes or
deletes, not what exists. `npm run check:backend` prints the fresh-create
total after every synth.

## The switch

`BACKEND_MODULES` names the product modules a deploy composes
(`amplify/shared/bootstrap.ts`; the registry it filters is
`moduleContributions` in `amplify/data/vertical.ts`):

| Value | Composes |
|---|---|
| unset or `all` | every module: every deploy of an existing environment |
| `none` | the foundation alone: the first deploy of a new environment |
| `widgets,reports` | the foundation plus the named modules |

An unknown id fails the synth with the known list. The foundation
(organizations, users, entitlements, EventLog, export, Assist) is always
composed. A composed module brings its models, its functions and stream
handlers, its entitlement gate, its record-access policies and its
EventLog entity types; a module on a data domain brings its tables to that
domain's API instead (`docs/data-domains.md`). The organization trigger
receives the same value, so a staged environment never seeds a table it
does not have. Product CDK wiring in `applyVerticalBackend` guards
module-specific work with `composed`.

Where it is set:

- **Amplify Hosting** (a deployed branch): an environment variable on the
  branch in the Amplify console. `ampx pipeline-deploy` reads it at synth.
  Change it, redeploy, repeat; unset it when every module is in. From the
  CLI, `aws amplify update-branch --environment-variables` takes a JSON
  object (`'{"BACKEND_MODULES":"widgets,reports"}'`; the comma form is
  split into a list and refused), and an empty object changes nothing:
  clear the variable with an empty value (`'{"BACKEND_MODULES":""}'`,
  which the backend reads as every module) or remove it in the console.
  A deploy already pending when the variable changes keeps the old value;
  stop it (`aws amplify stop-job`) and start a release. The app level and
  the branch level are separate maps, and the build reads whichever is
  set: set the variable in one place only, and check both before a deploy
  that must compose every module (`aws amplify get-app` and `get-branch`).
  A promotion between branches must carry one stage at a time; a
  promotion that bundles stages exceeds the cap, and the catch-up is a
  release job per stage commit (`start-job --job-type RELEASE --commit-id`).
- **CI** (`check:backend`): the job's environment. The check warns when
  the variable names a stage whose fresh-create total is over 2,500.
- **A sandbox**: `npm run sandbox -- --modules <value>`, or
  `BACKEND_MODULES` in `.env.sandbox` (copy `.env.sandbox.example`). A
  flag wins over the file; the file wins over the shell. Plain
  `npx ampx sandbox` works too with the variable exported in the shell.

## A new environment, step by step

1. **Measure the stages.** With the variable set to a candidate stage,
   `npm run check:backend` prints the fresh-create total of that set; a
   stage creates the difference from the stage before it, and that
   difference is what the cap bounds. Measured on a product of nine
   modules (2026-10-11): the foundation alone is about 1,060 resources in
   26 templates, and a module of 7 models adds about 350, so a module
   costs about 45 per model plus about 4 per function and a stage adds
   roughly 30 to 40 models. That lineup fit in five deploys:

   | Deploy | `BACKEND_MODULES` | Fresh-create total | Created by this deploy |
   |---|---|---|---|
   | 1 | `none` | 1,060 | 1,060 |
   | 2 | three small modules | 2,360 | about 1,300 |
   | 3 | plus a fourth | 3,020 | about 660 |
   | 4 | plus three more | about 4,500 | about 1,500 |
   | 5 | unset | 6,820 | about 2,300 (the two largest) |

   A stage near the cap splits in two when its modules grow.

   Each later deploy names every module already deployed plus the new
   ones: a module left out of the list is *deleted* from the environment,
   tables included, which is the same cap in the other direction and a
   data loss.
2. **Secrets first.** The deploy needs the Stripe secrets and the media
   CDN private key in every stage (placeholders are enough on a sandbox);
   see `docs/getting-started.md`.
3. **Deploy each stage** and wait for it to finish before the next. On
   Hosting that is a branch redeploy per stage; on a sandbox,
   `npm run sandbox -- --modules <stage> --once` per stage.
4. **Unset the variable** (Hosting) or leave it out of `.env.sandbox`
   once every module is deployed, so later deploys compose everything.

A staged environment is a real environment at every stage: the foundation
alone signs in, onboards an organization and shows the dashboard, with
every module tile reading as not licensed.

## Moving modules between APIs

The same cap bounds the move of a built module onto a data domain
(`docs/data-domains.md` § 5): the deploy deletes the module's model stacks
from the foundation API and creates them on the domain, so a module of 35
models is two deploys (out of the foundation with the module left out of
`BACKEND_MODULES`, then onto the domain with it named again, with the
re-seed between). One domain per deploy.

## Seeding a sandbox

A sandbox account's deploy role may create stacks but may not write a
table, create a user or invoke a function directly, so a smoke test cannot
seed its own data from a laptop. The deploy can: with `SANDBOX_SEED=1` and
`SANDBOX_SEED_PASSWORD=<a password meeting the pool's policy>` in
`.env.sandbox`, `amplify/backend.ts` adds a `sandbox-seed` stack whose
custom resource creates two organizations with an ACTIVE subscription row
and a Member and an Admin user each (`seed-org-all` licensed for every
module this deploy composes, `seed-org-none` with no modules) and removes
them when the variable is unset on a later deploy or the sandbox is
deleted. It is refused where Amplify Hosting sets `AWS_BRANCH`. A product's
smoke script signs in as those users and proves a data domain end to end
(`docs/data-domains.md` § 7); a CommonJS script, since an ESM one
configures a second copy of Amplify's core that the CommonJS-loaded
`lib/data-client.ts` never sees.

## What is not covered

- **A stream handler across domains.** A module's handler on a table of
  a module on another domain would be a mapping across stacks; the domain
  wiring refuses it. Cross-module effects between domains travel as
  events into the owner's handler, as `docs/data-coupling.md` says.
- **Dependencies between modules at deploy time.** No module's synth may
  depend on another's being composed (a shared table is gated at the
  mutation, and a deploy of the caller's module alone still carries the
  owner's table because the owner is composed with it). If one appears,
  the registry is where the rule goes.
- **A test of a staged deploy on Hosting.** Only the sandbox path and a
  product's staged move (one stage per deploy, `docs/data-domains.md`
  § 8) have run.
