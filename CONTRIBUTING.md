# Contributing

This repo is the **upstream white-label foundation**. Products built for
clients live in **downstream private repos** that start as copies of this one
and diverge freely (branding, vertical models, client-specific features).
This document describes how downstream work flows back upstream without
friction in either direction.

## Repo relationship: private mirror, not a GitHub fork

GitHub's fork button doesn't work well for this setup (private repo →
private repo in a different account), and it isn't needed. Use plain git:

```bash
# 1. Create a NEW empty private repo in the target account (no README)
# 2. Mirror the foundation into it:
git clone git@github.com:bax1billion/saas-platform.git acme-product
cd acme-product
git remote rename origin upstream
git remote add origin git@github.com:client-org/acme-product.git
git push -u origin main
```

The downstream now has the foundation's full history plus an `upstream`
remote. That shared history is what makes both directions cheap:

- **Foundation → product:** `git fetch upstream && git merge upstream/main`
  (config/vertical files rarely conflict — see the boundary below).
- **Product → foundation:** cherry-pick the foundation commits (see
  "Contributing back").

A GitHub *template repo* would also work for spinning up products, but it
severs the shared history — merges and cherry-picks become manual patch
work. Prefer the mirror.

## The foundation/vertical boundary

The whole design of this repo exists to make the divergence surface small
and predictable. Downstream products should only need to edit:

| Downstream-owned (never upstreamed) | Foundation (upstream-owned) |
|---|---|
| `config/` (site, pricing, theme) | everything in `app/` except copy |
| `public/` assets | `amplify/` except `data/vertical.ts` |
| `content/blog/` | `components/ui/`, `lib/` |
| `amplify/data/vertical.ts` | `docs/` (incl. playbooks) |
| landing/section copy | `docs/ROADMAP.md`, this file |
| vertical feature routes/components | build config, CI |

If product work forces an edit to a foundation file, that edit is by
definition a **candidate upstream contribution** — a missing seam, a bug, or
a generic capability. That's the signal to capture it.

## Commit hygiene in downstream repos (the thing that makes this work)

Never mix foundation changes and product changes in one commit.

- Prefix foundation-generic commits: `foundation: <subject>`.
- Keep them free of client/vertical references so they cherry-pick cleanly.
- Branding, copy, config, and vertical commits need no prefix — they simply
  never leave the product repo.

A `foundation:` commit that only touches foundation-owned paths will almost
always apply to upstream `main` without conflicts.

## Contributing back

1. In the product repo, identify the `foundation:` commits (or extract the
   generic part of mixed work into fresh commits on a branch off
   `upstream/main`).
2. Push the branch to upstream and open a PR:
   ```bash
   git checkout -b feat/usage-metering upstream/main
   git cherry-pick <sha>...
   git push upstream feat/usage-metering
   ```
3. Before the PR, run the de-branding checklist below.

### De-branding / confidentiality checklist (required)

- [ ] `grep -rniE "<client-name>|<product-name>" .` over the changed files — zero hits
- [ ] No client-identifying data: domains, emails, Stripe IDs, AWS account
      IDs, org names in fixtures/tests/comments
- [ ] New strings read from `config/` — no hardcoded product facts
- [ ] New colors are semantic tokens — no hex literals outside `config/theme.css`
- [ ] Vertical-specific parts stayed behind the seams (`vertical.ts`,
      `streamEventSources`, `config/`)
- [ ] `npx tsc --noEmit` and `npx next build` pass
- [ ] Docs updated if the contribution adds a capability or convention

### What makes a good upstream contribution

Implemented-once-needed-twice infrastructure: entitlement enforcement
helpers, webhook handling, app-shell components, onboarding flows, generic
Lambda implementations for the stubbed triggers, dashboard primitives,
playbook improvements, deploy/CI recipes. When in doubt, ask: *would the
next unrelated vertical use this unchanged?* If yes, upstream it.

## Keeping products up to date

Periodically in each product repo:

```bash
git fetch upstream
git merge upstream/main   # or rebase, before the product has shipped
```

Conflicts should be rare and confined to files both sides own legitimately
(e.g. `package.json` deps). Frequent conflicts in foundation files are a
smell that product code is leaking across the boundary.
