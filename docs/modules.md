# Modules

A **module** is a product inside the product: a self-contained feature area
with its own routes, navigation, data models and marketing page, which an
organization is entitled to either because it is included with every plan or
because it was purchased as a subscription add-on.

Modules are how a product grows without the foundation learning anything
about the vertical. The foundation owns the *pattern* (registry types, app
shell, entitlement resolution, billing seam, marketing sections); the product
owns the *instances* (`config/modules.ts` and everything under `modules/`).

## Anatomy of a module

```
config/modules.ts                 ← registry entry (ModuleDef)   [downstream]
config/theme.css                  ← --module-<id> accent token    [downstream]
modules/<id>/
  module.ts                       ← the ModuleDef (imported by the registry)
  schema.ts                       ← Amplify models/enums + EventLog names + org seeds
  seed.ts                         ← optional: sample data loader for demos/dev
  components/                     ← the module's UI (client components)
  lib/                            ← module-local helpers, types, queries
app/(app)/<id>/
  layout.tsx                      ← <ModuleShell moduleId="<id>"> (entitlement gate + module nav)
  page.tsx                        ← redirects to the module's first nav item
  <view>/page.tsx                 ← thin wrappers that render modules/<id>/components/*
amplify/data/vertical.ts          ← composes every module's schema.ts   [downstream]
amplify/backend.ts                ← streamEventSources entries for the module's tables
```

Rules that keep the seams clean:

- `module.ts` is imported by the **client bundle** (via `config/modules.ts`).
  It must never import `schema.ts` or anything from `@aws-amplify/backend`.
- `schema.ts` is imported by the **backend** (via `amplify/data/vertical.ts`)
  using relative paths (the Amplify tsconfig has no `@/` alias).
- Routes under `app/(app)/<id>/` stay thin. All real UI lives in
  `modules/<id>/components/` so a module can be lifted into another product
  by copying one directory and adding one registry line.
- Module accent colors are tokens in `config/theme.css`
  (`--module-<id>`), referenced as `var(--module-<id>)` from the registry.
  The app shell exposes the current module's accent as `--module-accent`.

## The registry entry

```ts
// modules/investigations/module.ts
import { Flame } from "lucide-react";
import type { ModuleDef } from "@/lib/modules/types";

export const investigationsModule: ModuleDef = {
  id: "investigations",            // never renamed — it's the entitlement key
  name: "Investigations",
  tagline: "Cause, evidence, report.",
  description: "…",
  icon: Flame,
  accent: "var(--module-investigations)",
  basePath: "/investigations",
  nav: [
    { label: "Cases", href: "/investigations/cases" },
    { label: "Report", href: "/investigations/report" },
  ],
  availability: "addon",           // "included" | "addon" | "coming-soon"
  stage: "beta",                   // "ga" | "beta" | "planned"
  price: "$149",
  marketing: { headline: "…", bullets: ["…"] },
};
```

```ts
// config/modules.ts
import { investigationsModule } from "@/modules/investigations/module";
export const modules: ModuleDef[] = [investigationsModule];
```

Everything downstream of the registry is automatic: the homepage module
showcase, `/modules/<id>` marketing pages, the sitemap, the pricing add-on
strip, the app-shell sidebar, and entitlement checks.

## Entitlements

`resolveEntitledModules()` in `lib/modules/index.ts` is the single decision
point, and `EntitlementsContext` exposes the result to the client as
`hasModule(id)`.

| Source | Meaning |
|---|---|
| `availability: "included"` | Entitled whenever the org has an access-granting subscription (ACTIVE / TRIALING / PAST_DUE). |
| `OrgSubscription.modules[]` | Add-on line items on the Stripe subscription. Written only by the Stripe webhook, which maps each line item's Product metadata `module=<id>`. |
| `Organization.settings.modules[]` | Admin-granted overrides — pilots, comps, internal orgs. This is also the sandbox path while the webhook is stubbed: set it on the org record to unlock a module locally. |
| `availability: "coming-soon"` | Never entitled; no routes required. |

Within a module, gate on **scale**, not capability, exactly like tiers
(`docs/subscriptions-and-payments.md`): every org that has the module gets
all of it. Extend `TierLimits` in `config/pricing.ts` with the module's
countable resources if it needs caps.

### Locked state

`ModuleShell` renders an upsell panel instead of the module when the org is
not entitled — the module's marketing copy, its price, and a link to
`/subscribe?module=<id>`. Modules never 404 for signed-in users; they sell.

## Billing

Add-on modules are Stripe Prices whose Product carries metadata
`module=<id>`. `createCheckoutSession` accepts an optional `modules` list and
adds one line item per module alongside the tier price; the price IDs come
from secrets named `STRIPE_PRICE_MODULE_<ID>` (uppercased, dashes → underscores),
declared per product in `amplify/data/vertical.ts` (`verticalModulePriceSecrets`).

The webhook handler mirrors line items into `OrgSubscription.modules` on
every subscription event, so adding or removing a module in the Stripe
Dashboard is reflected without a deploy.

## Data models

Follow `docs/core-data-model.md` conventions. Prefix model names with the
module name to keep the global schema namespace readable
(`Investigation`, `InvestigationMedia`, …). Each module's `schema.ts` exports:

```ts
export const investigationsModels = { /* a.enum / a.model entries */ };
export const investigationsEntityTypes = ["INVESTIGATION", "INVESTIGATION_MEDIA"];
export const investigationsEventActions = ["CASE_SEALED"];
export const investigationsOrgSeeds: Array<Record<string, unknown>> = [];
export const investigationsPriceSecret = "STRIPE_PRICE_MODULE_INVESTIGATIONS";
```

and `amplify/data/vertical.ts` spreads them into the vertical exports.

## Checklist for a new module

1. `modules/<id>/module.ts` — write the ModuleDef; add the accent token to
   `config/theme.css` (light and dark).
2. Register it in `config/modules.ts`.
3. `modules/<id>/schema.ts` — models, enums, EventLog names, seeds; compose
   in `amplify/data/vertical.ts`; add tables to `streamEventSources`.
4. `app/(app)/<id>/layout.tsx` with `<ModuleShell moduleId="<id>">`, a
   redirecting `page.tsx`, and one thin `page.tsx` per nav item.
5. Build the UI in `modules/<id>/components/` using `components/ui/*`.
6. If it's an add-on: create the Stripe Product (metadata `module=<id>`) and
   Price; set the `STRIPE_PRICE_MODULE_<ID>` secret; add it to
   `verticalModulePriceSecrets`.
7. Run `npx tsc --noEmit` and `npx next build`; deploy the sandbox.
