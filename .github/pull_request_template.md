<!--
Title: a short, plain name for the change; `[<id>] <short title>` when it has a ticket.
Target: the default branch. Open as a draft while you work; mark it ready when it should merge.
The checks explain themselves on the PR; "tier-1 review" waits for the lead when the change needs a person.
-->

## Before

What a user or an admin saw or could not do before this change, in plain words.

## After

What they see or can do now. One line per behaviour that changed.

## Checks

- [ ] `npm test`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm run check:backend` pass locally
- [ ] `npx next build` (UI change) and `npx tsc --noEmit -p amplify/tsconfig.json` (backend change) pass locally
- [ ] `docs/<id>-changelog.md` has this change; `docs/<id>-module.md` still matches the code (module work)
- [ ] Field door: taps at the token floors, three widths looked at (390, 1024, 1280)

**Not exercised:** name what has not run against a sandbox or a deployed branch (a Lambda, a stream handler, a deploy). "Nothing" is an answer.
