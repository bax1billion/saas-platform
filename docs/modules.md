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
  components/                     ← the module's UI (client components)
  lib/                            ← module-local helpers, types, queries, seed data
amplify/data/modules/<id>.ts      ← Amplify models/enums + EventLog names + seeds + price secret
app/(app)/<id>/
  layout.tsx                      ← <ModuleShell moduleId="<id>"> (entitlement gate + module nav)
  page.tsx                        ← redirects to the module's first nav item
  <view>/page.tsx                 ← thin wrappers that render modules/<id>/components/*
amplify/data/vertical.ts          ← composes every module's schema file  [downstream]
amplify/functions/<id>-<verb>/    ← module-owned Lambdas (stream handlers, commands)
amplify/backend.ts                ← spreads the vertical seams automatically
                                     [downstream] — no per-module edit
```

Rules that keep the seams clean:

- `module.ts` is imported by the **client bundle** (via `config/modules.ts`).
  It must never import the schema file or anything from `@aws-amplify/backend`.
- The schema file lives **inside `amplify/`** (`amplify/data/modules/<id>.ts`)
  and is composed by `amplify/data/vertical.ts` with a relative import.
  `ampx` loads the backend as ES modules; a schema placed under `modules/`
  resolves as CommonJS and fails with "does not provide an export named …".
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

`resolveEntitledModules()` in `lib/modules/index.ts` is the decision on the
client (`EntitlementsContext` → `hasModule(id)`), and
`amplify/data/entitlements/` applies the same rules on the server: every
`create|update|delete` on a model listed in `verticalModuleTables`
(`amplify/data/vertical.ts`) is rejected with `ModuleRequired` unless the org
holds the module. Add each new module's models to that map.

| Source | Meaning |
|---|---|
| `availability: "included"` | Entitled whenever the org has an access-granting subscription (ACTIVE / TRIALING / PAST_DUE). |
| `OrgSubscription.modules[]` | Add-on line items on the Stripe subscription. Written only by the Stripe webhook, which maps each line item's Product metadata `module=<id>`. |
| `OrgEntitlementOverride` (latest per org, honors `expiresAt`) | **Platform-operator grants** — pilots, comps, and offline purchases (checks/POs). Written only by the `Operator` Cognito group; org roles read. Managed from the operator card on /settings (renders only for Operators) or the AppSync console. Replaces the old `Organization.settings` overrides, which org Admins could write themselves. |
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
(`Investigation`, `InvestigationMedia`, …). Each `amplify/data/modules/<id>.ts` exports:

```ts
export const investigationsModels = { /* a.enum / a.model entries */ };
export const investigationsEntityTypes = ["INVESTIGATION", "INVESTIGATION_MEDIA"];
export const investigationsEventActions = ["CASE_SEALED"];
export const investigationsOrgSeeds: Array<Record<string, unknown>> = [];
export const investigationsPriceSecret = "STRIPE_PRICE_MODULE_INVESTIGATIONS";
```

and `amplify/data/vertical.ts` spreads them into the vertical exports.

## Backend business logic

Some writes can't be trusted to the client: a decision only a supervisor may
make, a computed balance, a state transition that has to follow a policy.
There are two ways to express that, and they are not equal.

### The pattern: client writes, field rules restrict, a stream handler reacts

**Default to this.** The client talks to AppSync natively — plain generated
model mutations, no custom resolver. The columns the server owns carry a
**field-level authorization rule that grants no group a write**
(`docs/core-data-model.md` §2.5), so the client physically cannot set them.
A Lambda on the table's DynamoDB stream reacts to the write and fills those
columns over IAM.

```ts
// amplify/data/modules/widgets.ts
WidgetRequest: a.model({
  orgId: a.id().required().authorization(MEMBER_FIELD),
  note:  a.string(),                       // client-owned
  // server-owned: read for all, write for nobody
  state:      a.string().default('PENDING').authorization(READ_ALL),
  decidedAt:  a.datetime().authorization(READ_ALL),
  decidedBy:  a.string().authorization(READ_ALL),
}) …

// amplify/data/vertical.ts
export const verticalFunctions = { widgetDecision: widgetDecisionFunction };
export const verticalStreamConsumers = { WidgetRequest: ['widgetDecision'] };
```

Why this is the default:

- **Tenancy stays declarative.** The client's write goes through the model's
  own `orgId`/group rules. Nobody hand-writes an ownership check, so nobody
  forgets one.
- **Retries are free.** Stream delivery is at-least-once with automatic
  retry. A handler that fans one row out into many gets that for nothing;
  a synchronous handler doing the same needs a compensating rollback it has
  to implement — and get right — itself.
- **One write path.** The audit trail, the handler, and any future consumer
  all observe the same stream.

Handlers must be **idempotent**: at-least-once means the same record can
arrive twice. Key off something stable on the row, and treat "already
decided" as success rather than an error.

For a client-initiated *transition* on a server-owned column — "I want to
withdraw this" when `state` is write-to-nobody — give the client an intent
column it does own (`requestedState`) and let the handler reconcile it into
`state`. Desired-state versus actual, rather than a command.

### The field written is the authority

**A DynamoDB stream record carries no caller identity.** It has
`NewImage`, `OldImage` and `Keys` — nothing about who made the write. A
handler therefore cannot ask "was this person an Admin?" or "do they own
this row?" after the fact.

The way through is to **encode the authority in *which* field was written**
and let field-level authorization decide who may write each one. The
handler reads which column moved and infers the authority from that,
because AppSync already refused the write otherwise.

```ts
// One transition, two doors — the door proves the authority.
approveIntent:    a.string().authorization(a => [        // Admin only
  a.group('Admin').to(['create', 'read', 'update']),
  a.groups(['Member', 'Viewer']).to(['read']),
]),
withdrawRequested: a.boolean().authorization(a => [      // row owner only
  a.ownerDefinedIn('ownerSub').to(['read', 'update']),
  a.groups(['Admin', 'Member', 'Viewer']).to(['read']),
]),
```

The same trick covers "acting on someone else's behalf": make the
`onBehalfOfMemberId` column Admin-writable, leave it absent for a
self-service write, and the handler knows which it is.

**Row-level authority costs more than group-level.** Group rules
(`Admin`, `Member`) are free — they're claims in the token. An owner rule
is not: `allow.ownerDefinedIn('ownerSub')` requires the Cognito sub stored
on the row (denormalized if the identity lives on another model), and it
adds an owner *role* to the whole model — so every `required()` field must
then restate an owner read grant (`docs/core-data-model.md` §2.5). Budget
for that before reaching for it, and prefer expressing a transition in
group terms when the domain allows.

### The exception: a command mutation

A custom mutation backed by a Lambda (`verticalModuleMutations` +
`verticalFunctions`) is the escape hatch. It is the right call in one
situation: **the request must be rejected before anything is written.**
Validation that has to fail loudly and synchronously — a closed period, a
malformed span, a reference to another org's row — is awkward under streams,
because the row exists by the time the handler sees it and "rejected" has to
become write-then-mark-invalid.

Everything else about a command is a cost you take on:

- It runs as a transformer admin role via `allow.resource`, which **bypasses
  every model and field rule**. It must re-check tenancy itself — load the
  row, compare its `orgId` with the caller's — on every row it touches.
- It is a new surface that entitlement enforcement doesn't cover by default,
  which is why it must be listed in `verticalModuleMutations`. Forget that
  and an unlicensed org has a side door into a paid module.
- Multi-row work inside one invocation has no transaction. If it fails
  halfway, you own the cleanup.

If you reach for a command, say in the module doc why the stream shape
didn't fit.

## Checklist for a new module

1. `modules/<id>/module.ts` — write the ModuleDef; add the accent token to
   `config/theme.css` (light and dark).
2. Register it in `config/modules.ts`.
3. `amplify/data/modules/<id>.ts` — models, enums, EventLog names, seeds,
   stream tables, price secret; compose in `amplify/data/vertical.ts`
   (including `verticalModuleTables` so the backend gates its mutations).
   Server-owned columns get field-level rules, not a satellite model.
4. Server-authoritative logic → a stream handler in `verticalFunctions` +
   `verticalStreamConsumers` (see "Backend business logic"). Only reach for
   a command mutation when the request must be rejected before it is
   written — and then list it in `verticalModuleMutations`.
5. `app/(app)/<id>/layout.tsx` with `<ModuleShell moduleId="<id>">`, a
   redirecting `page.tsx`, and one thin `page.tsx` per nav item.
6. Build the UI in `modules/<id>/components/` using `components/ui/*`.
7. If it's an add-on: create the Stripe Product (metadata `module=<id>`) and
   Price; set the `STRIPE_PRICE_MODULE_<ID>` secret; add it to
   `verticalModulePriceSecrets`.
8. Run `npm test`, `npx tsc --noEmit`, `npm run check:backend`, and
   `npx next build`; deploy the sandbox.
