# Data ownership and coupling between modules

**Status:** architecture guidance v1, 2026-09-26. Foundation-generic; the
examples use a made-up lineup (Widgets, Reports, Billing) to stay neutral.
Companion to `docs/modules.md` (the module contract) and
`docs/core-data-model.md` (the core schema).

Modules are sold one at a time and each "stands on its own", yet the
platform's whole pitch is that they share one roster, one set of places
and one set of records. Both are true, and this document says how: modules
own their data and never share write access; the platform owns the small
set of facts every product needs; cross-module knowledge flows through
published contracts (ids, events, read models), never through another
module's tables; and nothing a module does may *require* another module to
be licensed.

---

## 1. Three tiers of data

| Tier | Owner | Examples | Who writes | Who reads |
|---|---|---|---|---|
| **Core** | The platform (`amplify/data/resource.ts`) | Organization, User, Site, EventLog, subscriptions, and any shared **hubs** a product declares (see §3) | Platform handlers and commands only; never a module's client code | Every module, always available, no entitlement needed beyond base access |
| **Module** | One module (`amplify/data/modules/<id>.ts`) | `WidgetRequest`, `ReportRun`, `BillingInvoice` | That module's clients and Lambdas, gated by its entitlement | That module; other modules only through a published read model (§4) |
| **Extension** | One module, keyed by a core id | `WidgetSiteProfile` (the Widgets view of a Site), `ReportUserPreference` (keyed by User) | The owning module | As module data |

A fact lives in exactly one tier and one table. "One home per fact" is
enforced by ownership, not by hope.

---

## 2. The rules

1. **Single writer.** Every table has one owning module (or the platform).
   No other module's code, client or Lambda, writes to it. Not even "just
   one field." Inside a module, columns may have different writers through
   field-level authorization (`docs/core-data-model.md` §2.5); that stays
   inside the module.
2. **Core is module-agnostic.** No core model carries a column that only
   one module understands. Module-specific attributes live in an extension
   table keyed by the core id. The one allowed escape is a small
   `extensions` JSON bag on a hub for low-value attributes that are never
   indexed, never authorized differently and never load-bearing for another
   module. If a field needs a GSI or its own access rule, it is a table.
3. **Reference by id, never by copy.** A module that needs another
   module's record stores the id (with a GSI if it lists by it). No
   `belongsTo` or `hasMany` across module files or into core (the Amplify
   transformer needs both sides and synth fails; the boundary is also the
   point). Copies are forbidden except point-in-time facts (§5).
4. **Read through contracts, not tables.** A module may read another
   module's data only through that module's published read model: a
   service function in `lib/services/<module>/`, a projection table the
   owner maintains, or an AppSync query the owner exposes. It never queries
   the other module's tables by name. The contract is versioned by the
   owner and listed in its module doc under "Provides".
5. **Never required.** A module must be fully usable when no other module
   is licensed. Cross-module reads are enrichment: the consuming screen
   shows a local fallback or an honest empty state ("Turn on Reports to see
   trends here"), never a spinner, never an error. Entitlement already
   enforces this on the server: a table's mutations are refused unless the
   org holds that module, so a consumer cannot depend on data it is not
   entitled to.
6. **Write across modules by event only.** When a fact in module A must
   create or change a record in module B, A publishes an event from its
   stream handler; B's own handler consumes it and writes B's table over
   IAM, idempotently. A never writes B's table and never calls B's mutation
   from the client. "One function emits one event; subscribers subscribe;
   never four calls from the UI."
7. **Core hubs are written through platform commands.** Creating a hub row
   goes through a platform mutation or a platform stream handler with a
   dedupe rule, so two modules cannot mint two records for one fact.
8. **Dependency direction.** Modules depend on core. Core never depends on
   a module. A module may depend on another module's *contract*
   (`lib/services/<other>`, event names) but never on its components,
   schema file or table names. `modules/<a>/` never imports from
   `modules/<b>/`.
9. **Snapshots are facts, caches are bugs.** See §5.
10. **Tenancy first, then module.** Every table still carries `orgId` and
    the record-access rules; cross-module reads never widen access. A
    read model returns what the caller could see in the owning module,
    no more (a status, never the detail; a restricted record absent from
    every count).

---

## 3. Core hubs

A **hub** is a record that must exist whichever products an organization
buys: the facts two or more modules hang their own records off. Hubs are
**core**, not owned by any module, or an org without the "owning" module
would have no record to point at. Minimal by design: enough for identity,
dedupe, tenancy and the join key; everything product-specific is an
extension.

The foundation ships `Organization`, `User` and `Site` as hubs. A vertical
adds its own (an incident, a place, an asset, a case) and declares them in
the vertical seam so the foundation schema stays neutral; their fields
must stay module-agnostic for the same reason. The foundation's test for a
hub field: *would two unrelated modules of this product both read it?* If
only one would, it is an extension column.

Rules specific to hubs: a hub's `extensions` JSON is the only JSON bag;
never query it. A hub flag that one module flips and several read (an
"in service" bit, an "active" bit) is written by the platform handler that
consumes the owning module's event, so every reader reads one field and
never the owner's table.

A **shared ledger** (acknowledgments, completions, grants) follows the
same shape: one append-only server-written table with a platform handler
as the sole writer; modules emit events into it. "Module A writes, others
write through it" becomes "the ledger handler writes, everyone emits."

---

## 4. Contracts a module publishes

Each module doc gains two short sections.

**Provides** (what others may use):
- Read models: `lib/services/<module>/<fn>.ts` functions or an owner-
  maintained projection table, with the fields exposed and the access rule
  ("returns status and dates only").
- Events: names, payload (ids and the minimum facts), idempotency key.

**Consumes** (optional, with fallback):
- Which other modules' read models and events it uses, and what it shows
  when that module is absent.

Example:

| Provider | Provides | Consumers and their fallback |
|---|---|---|
| Reports | `trendsFor(siteId)` (counts and dates only); events `report.published`, `report.superseded` | Widgets dashboard tile (fallback: no tile); Billing usage line (fallback: usage from Billing's own rows) |
| Widgets | `widgetsAt(siteId)`; events `widget.retired`, `widget.moved` | Reports site roll-up (fallback: count rows by id); Billing device count |
| Billing | events `invoice.paid`, `invoice.overdue` | Widgets banner (fallback: none, degrade quietly) |

---

## 5. Copies that are allowed: point-in-time facts

A copy is legitimate when the value at that moment is the record, and the
source will legitimately change later:

- A status or level stamped on a row at the time of the event it records.
- The version hash of a policy on an acknowledgment; the `definitionVersion`
  on a saved chart; the cited edition on an inspection.
- The recipient list and verdicts on a sent notification.
- Snapshot hashes on linked files.

Mark these with `stampedAt` (or the event's timestamp) and never
"refresh" them. Everything else that looks like a copy (a roster in one
module, a person's name on another module's ticket) is a cache and must be
replaced by the id plus a read.

---

## 6. Feasibility on this stack

- **AppSync and DynamoDB** have no joins, so "read through a contract" is
  the natural shape anyway: a service function or a projection, not a
  resolver reaching into another table. Projections maintained by the
  owner's stream handler are the cheap version of a read model.
- **Entitlement gating** is per module table (`verticalModuleTables`), so
  cross-module reads by an unlicensed org fail on the server today. Read
  models for core-tier facts (hubs, ledger) need base access only.
- **Events** are DynamoDB streams to Lambdas today; fan-out to another
  module's Lambda is one EventBridge bus away and keeps at-least-once
  delivery, so handlers stay idempotent (they already must).
- **Field-level authorization** lets a core hub carry a few columns with
  different writers without splitting tables, but it complicates required
  fields and subscriptions (`docs/core-data-model.md` §2.5). Prefer an
  extension table for anything a module owns.
- **Foundation boundary.** Foundation hubs stay vertical-neutral. A
  vertical's own hubs and their fields belong in the vertical seam
  (`amplify/data/vertical.ts`) as additions, the same way
  `verticalEventActions` extends the enum today.

---

## 7. Enforcement

Two checks run on every PR:

1. **Schema boundary test** (`lib/schema-boundaries.test.ts`, in `npm test`):
   reads every `amplify/data/modules/*.ts` and fails if a file references a
   model or enum through `a.ref`, `belongsTo`, `hasMany` or `hasOne` that is
   neither declared in that file nor a core name from
   `amplify/data/resource.ts`. Comments are ignored. The test skips itself
   while a product has no `amplify/data/modules/` directory yet.
2. **Import boundary lint** (`eslint.config.mjs`, CI step "Lint"):
   `modules/<a>/**` may not import `@/modules/<b>` or any relative path
   into another module's folder. The message names the contract to use
   instead. One override per module directory, generated from the folder
   listing, so a new module is covered the day it appears.

A product may add a third: a test that every registered module has a
`docs/<id>-module.md` with a "Provides" and a "Consumes" section.

The existing entitlement tests keep proving that unlicensed reads and
writes fail. What is still not enforced: a module's Lambda reading another
module's table by name. That is caught in review until the read models in
`lib/services/*` exist to point at.

## 8. Answers to the questions this doc was written for

- *Avoid two modules writing the same table?* Yes. Single writer per table,
  always. Cross-module effects travel as events into the owner's handler.
- *Reading another module's tables is fine but never required?* Fine only
  through the owner's contract, never the table; and never required, with a
  visible fallback. Entitlement enforces the "never required" half for you.
- *Core models independent of modules, with nullable module-specific
  fields?* Independent, yes. Nullable module fields on core, no: they
  couple the foundation schema to every vertical, they cannot carry a
  different access rule, and they cost GSI budget on the core table.
  Extension tables keyed by the core id give the same convenience with a
  clean boundary. The exception is a single non-indexed JSON bag on a hub
  for trivia.
- *Which module "owns" a shared record?* None. The shared record is a hub;
  a module owns its extension of it. That distinction is what lets two
  modules each stand alone and still talk about the same thing.
