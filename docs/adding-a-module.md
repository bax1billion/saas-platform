# Adding a module — team walkthrough

The hands-on guide for building a module end to end, using a fictional
`run` module as the worked example throughout. The contract this
walkthrough implements is defined in [`docs/modules.md`](modules.md) — read
that once first; this doc is the "now actually do it" companion piece.

A module is a product inside the product: its own routes, nav, data models,
marketing page, and entitlement. Registering one entry in
`config/modules.ts` automatically lights up the homepage showcase,
`/modules/<id>` marketing page, sitemap, pricing add-on strip, app-shell
sidebar (with a lock when unlicensed), and entitlement checks — client and
backend.

Throughout, replace `run` / `Run` with your module id and name.

## 0. Before you write code

- Pick the **module id** (`run`) — lowercase, permanent. It becomes the
  entitlement key, Stripe metadata value, secret name, and directory name.
- Know your spec — prototype, client docs, research — and reconcile it
  into `docs/<id>-module.md` before you write code. Future-you needs the
  build-state table more than the prose.
- Confirm the accent color exists in the brand system (deck / theme).

## 1. Register the module (marketing lights up first)

1. **Accent tokens** in `config/theme.css` — light *and* dark:
   ```css
   --module-run: #2e7d8f;          /* :root */
   --module-run: #3fa0b5;          /* .dark — re-stepped for dark surfaces */
   ```
2. **Definition** in `modules/run/module.ts` (client-safe — never import
   the schema file or `@aws-amplify/backend` here):
   ```ts
   import { ClipboardList } from "lucide-react";
   import type { ModuleDef } from "@/lib/modules/types";

   export const runModule: ModuleDef = {
     id: "run",
     name: "Run",
     tagline: "Fire and EMS incident records.",
     description: "…",
     icon: ClipboardList,
     accent: "var(--module-run)",
     basePath: "/run",
     nav: [{ label: "Incidents", href: "/run/incidents" }],
     availability: "addon",      // or "included" | "coming-soon"
     stage: "beta",
     price: "$149",
     marketing: { headline: "…", bullets: ["…"] },
   };
   ```
3. **Registry** — `config/modules.ts`: import it, replace the coming-soon
   stub (keep the same `id`!), position in the array = display order.

Run `npm run dev`: homepage card, `/modules/run`, pricing strip, and a
locked sidebar entry all exist already. `coming-soon` modules stop here —
no routes, no schema.

## 2. Data models (backend)

1. **Schema file** — `amplify/data/modules/run.ts`. Must live under
   `amplify/` (files outside it load as CommonJS and break synth — see
   docs/modules.md). Follow `docs/core-data-model.md`:
   - prefix model names (`RunIncident`, …) — the schema namespace is global
   - `orgId: a.id().required()` + an `…ByOrg` GSI on every model; **no**
     `belongsTo('Organization')` (needs a matching hasMany on a foundation
     model and fails synth without it)
   - `sortDate` for chronological GSIs; `isDeleted` for soft delete
   - export the six values the vertical seam composes: `runModels`,
     `runEntityTypes`, `runEventActions`, `runOrgSeeds`,
     `runPriceSecret` (`'STRIPE_PRICE_MODULE_RUN'`), and `runStreamTables`
2. **Compose** in `amplify/data/vertical.ts` — spread each export into the
   `vertical*` aggregates and add `run: runStreamTables` to
   `verticalModuleTables` (that map is what the backend entitlement steps
   gate on) and `run: runPriceSecret` to `verticalModulePriceSecrets`.
3. **Verify before any deploy:**
   ```bash
   npx tsc --noEmit
   npm run check:backend        # full local CDK synth — prints
                                # "Entitlement enforcement on N mutations"
   npm run check:entitlements
   ```
   Expect N to grow by 3 × (number of new models), plus one per command
   mutation (below).
4. Deploy the sandbox (`npx ampx sandbox` picks it up in watch mode).

**Server-authoritative writes** — a decision only one role may make, a
computed balance, a state transition that has to follow a policy. Read
`docs/modules.md` → "Backend business logic" before choosing a shape; the
summary is that there are two and they are not equal.

*Default — a stream handler.* Give the server-owned columns a field-level
rule that grants no group a write (`docs/core-data-model.md` §2.5), let
the client create the row with a plain generated mutation, and react on
the table's stream:
- the function lives in `amplify/functions/<module>-<verb>/{resource,handler}.ts`
  and may import pure code from `modules/<id>/lib/` by **relative path**
  (the Lambda bundler has no `@/` alias);
- the schema file exports `<id>Functions` (`{ constructName: fn }`);
- `vertical.ts` spreads that into `verticalFunctions` and adds the table →
  handler entry to `verticalStreamConsumers`. No edits to `backend.ts` or
  `resource.ts`.

Tenancy stays declarative (the client's write went through the model's own
rules) and stream delivery retries for you. Handlers must be **idempotent**
— at-least-once means the same record can arrive twice.

*Exception — a command mutation.* Only when the request must be **rejected
before anything is written** — a closed period, a malformed span, a
reference to another org's row. That validation is awkward under streams,
because the row exists by the time the handler sees it and "rejected" has
to become write-then-mark-invalid. Additionally:
- the schema file declares the mutations with `a.handler.function(fn)` and
  exports `<id>CommandMutations` (their field names);
- `vertical.ts` spreads those into `verticalModuleMutations` — **required**,
  or the command is an ungated side door into a paid module;
- the handler enforces tenancy itself: `allow.resource` bypasses every
  model *and* field rule, so load the row and compare its `orgId` with the
  caller's before acting;
- multi-row work has no transaction. A command that fans one request out
  into several rows owns its own compensating rollback on partial failure —
  a cost the stream shape does not carry, since delivery retries.

## 3. Routes and UI (thin routes, real components)

Routes under `app/(app)/run/` stay thin; all real UI lives in
`modules/run/components/` so a module can be lifted by copying a directory.

```
app/(app)/run/
  layout.tsx      → <ModuleShell moduleId="run">{children}</ModuleShell>
  page.tsx        → renders modules/run/components/ModuleHome
  incidents/page.tsx → renders the first real view
```

`ModuleShell` gives you the entitlement gate (locked orgs see the upsell
panel — modules never 404, they sell), the header with your accent, and the
tab nav from `module.ts`. Inside it, `--module-accent` is set — use it
instead of your hex.

**The module home page is the demo surface.** Whatever else is unfinished,
this page should be worth opening in front of someone:

- live stats from a real query where something is built,
- one card per area — `Live` badge for working areas, a dashed
  `TODO · spec'd` badge for everything else, each stating what it will be
  and where it's spec'd,
- the module's guardrail copy at the bottom.

This makes the module navigable and demoable from day one with zero fake
data: unbuilt areas are honest placeholders on real routes.

Component conventions: `components/ui/*` (shadcn) + `lib/utils` `cn()`;
data via `getDataClient()` from `@/lib/data-client`; org id and role from
`useEntitlements()` / `useAuth()`; toasts via `sonner`. Keep
`modules/run/lib/` free of DOM/Next imports (types, labels, pure logic) —
the native mobile app will import from it.

## 4. See it in the app

1. Sign in as your org's Admin (flow: `docs/onboarding-and-permissions.md`).
2. Settings → **Pilot & development access** → enable base access + Run.
3. Sidebar → Run → your module home.

No Stripe setup needed until you sell it. When you do: create the Stripe
Product with metadata `module=run` + a Price, set the
`STRIPE_PRICE_MODULE_RUN` secret in every environment (placeholder value
is fine before launch — the deploy fails if the secret *name* is missing),
and the webhook + checkout handle the rest.

## 5. Definition of demoable (checklist)

- [ ] Homepage card, `/modules/run`, pricing strip render
- [ ] `npm run check:backend` shows the new gated mutations; sandbox deployed
- [ ] Locked state: a non-entitled org sees the upsell panel at `/run`
- [ ] Entitled state: module home with live stats + TODO cards
- [ ] First real view creates/reads records (respecting Member/Viewer roles)
- [ ] Sample-data seeding or a "load sample" affordance for demos
- [ ] `docs/<id>-module.md` started (spec sources, build-state, roadmap)
- [ ] `npm test` (add unit tests for the module's pure logic in
      `modules/<id>/lib/*.test.ts` — the DOM-free helpers are the ones
      worth covering)
- [ ] `npx tsc --noEmit` · `npx eslint` on new paths · `npx next build`

## Gotchas collected the hard way

| Symptom | Cause |
|---|---|
| Synth: "does not provide an export named …" | Schema file outside `amplify/` (CJS/ESM boundary) |
| Synth: "Unable to find associated relationship definition in Organization" | `belongsTo('Organization')` on a module model |
| Synth: "Mutation cannot redeclare field create<X>" | Custom mutation name collides with a generated CRUD mutation |
| Deploy: "Failed to retrieve backend secret" | `STRIPE_PRICE_MODULE_<ID>` secret name not created in that environment |
| Writes fail with `ModuleRequired` despite the pilot card | Module id mismatch between `config/modules.ts`, `verticalModuleTables`, and the settings override |
| Everything read-only right after onboarding | Token not force-refreshed — sign out/in |
| `tsc` errors in `.next/types` after switching branches | Stale build artifacts — `rm -rf .next` |
