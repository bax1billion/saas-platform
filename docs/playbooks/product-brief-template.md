# Project Brief — <Product Name>: <One-line category descriptor> (<MVP focus>)

> Template. Replace every `<placeholder>`; delete guidance blockquotes when done. Keep the brief short enough that an engineer (or an AI assistant) can hold the whole thing in mind — it is the contract for what the MVP is and, just as importantly, what it is not.

## 0) Product Identity
**Product name:** <Product>
**Brand / company:** <Company>
**Domain:** <domain.com>

<One or two sentences on what the name means and why it was chosen — see `brand-strategy.md` for the naming methodology.>

## 1) Mission / Outcome
Build a <adjective> <category> for <ICP> that lets them confidently answer:

- "<Question the buyer asks under pressure #1>"
- "<Question #2>"
- "<Question #3>"
- "<Question #4>"

> Guidance: phrase the mission as the 3–5 questions the buyer must be able to answer instantly. This keeps every feature decision honest — a feature either helps answer one of these questions or it's out of scope.

This is NOT <the tempting mispositioning — e.g., "an AI-first product">. It is a **<what it actually is — e.g., "system of record">** with <its defining property>.

## 2) Market Context

**Market size:** <TAM, current value, projection, CAGR; cite the segment closest to your ICP and its growth rate>.

**Market gap:** <Who overserves the market and how (too complex/expensive/wrong vertical). What the underserved segment uses today (spreadsheets, email, paper, tribal knowledge).>

**Competitive differentiators:**
- <Differentiator 1 — the core mechanism/guarantee>
- <Differentiator 2 — the deliberate simplification vs incumbents>
- <Differentiator 3 — a visibility/at-a-glance feature>
- <Differentiator 4 — a one-click output the buyer needs at a critical moment>
- <Pricing-model differentiator, e.g., no per-user fees>
- <Onboarding-speed differentiator, e.g., days not months>

## 3) Target Customer / ICP
**Primary:** <Job title(s)> at <company size/segment>.
They currently use <the status-quo tools>.

They are responsible for <the outcome they're accountable for> and want:
- <capability 1>
- <capability 2>
- <capability 3>
- <capability 4>

**Research-validated pain points:**
- **<Pain 1>** — <impact>
- **<Pain 2>** — <impact>
- **<Pain 3>** — <impact>
- **<Pain 4>** — <impact>

> Guidance: each pain must come from real research (interviews, forums, competitor reviews), stated in the buyer's vocabulary with its concrete impact. These drive the landing page's problem section too.

## 4) Domain Context (Constraints We Must Support)
> Guidance: list the external frameworks, regulations, standards, or integrations the product must accommodate — with a note on how deep the MVP goes (often: "support mapping to them" rather than "fully encode them"). State the core domain concept as a chain, e.g. `<TopLevelConcept> -> <SubConcept> -> <linked artifacts>`.

- <Constraint / standard 1>
- <Constraint / standard 2>
- <…>

Core concept: **<X -> Y -> Z>**

## 5) Product Philosophy (Non-Negotiables)
> Guidance: 4–6 rules that settle arguments in advance. Include at least one "X > Y" tradeoff rule, one data-integrity rule, one UX rule, and the pricing stance.

- **<Value A> > <value B>** (e.g., defensibility > cleverness)
- Everything important is **<integrity property>** (e.g., timestamped and traceable)
- <Data rule — e.g., immutable/append-only history for critical records>
- Simple, reliable UI; fast to adopt; minimal training
- "Boring but effective" beats feature-bloat
- **<Pricing stance>** (e.g., no per-user fees, all modules included)

## 6) Tech Stack
> Guidance: name concrete choices — framework, backend, auth, API, database, storage, styling, hosting. The platform default stack lives in the repo; only list deviations if you're changing something.

- **Framework:** <…>
- **Backend:** <…>
- **Auth:** <…>
- **API:** <…>
- **Database:** <…>
- **Storage:** <…>
- **Styling:** <…>
- **Hosting:** <…>

## 7) MVP Scope (Phase 1)
MVP should deliver:
- <capability 1 — usually auth/login>
- <capability 2>
- <capability 3>
- <capability 4>
- <capability 5 — usually the key output/export>

### MVP Feature Areas (prioritized)
> Guidance: 4–6 lettered areas, each with 3–4 bullets. Order = priority. Within each area, state the minimum viable version explicitly (e.g., "at minimum: Draft -> In Review -> Approved").

#### A) <Feature area 1>
- <bullet>
- <bullet>

#### B) <Feature area 2>
- <bullet>

#### C) <Feature area 3>
- <bullet>

#### D) <Feature area 4>
- <bullet>

#### E) <Feature area 5 — often a status dashboard>
> If a status dashboard: define the traffic-light semantics explicitly.
- **Red** = <critical condition>
- **Yellow** = <warning condition (configurable threshold)>
- **Green** = <compliant/healthy condition>

### Feature Requests Validated by Market Research
> Guidance: numbered list of recurring requests from real buyers that map to the MVP and inform prioritization and messaging. If you can't fill this, do more research before building.

1. <request>
2. <request>
3. <…>

## 8) What NOT to Build in MVP
> Guidance: this section prevents scope creep and is as valuable as the scope itself. List tempting features with the reason deferred (enterprise-only, needs infra you don't have yet, later phase). Common universal deferrals:

- Full workflow automation across departments
- Complex RBAC across many roles (keep simple)
- Multi-tenant enterprise SSO
- <Deep domain content libraries — start minimal; allow import later>
- AI features (summarization / RAG / agents) — later optional
- <Anything requiring custom infra (e.g., PDF generation, magic-link auth) — defer to Phase 2>
- <Enterprise modules for your domain>
- Collaborative real-time editing — defer (comments/suggestions first)

## 9) Pricing (for product thinking, not enforced in code)
- $<X>/mo — <tier 1 name>
- $<Y>/mo — <tier 2 name>
- $<Z>/mo — <tier 3 name>

**Key differentiator:** <pricing-model advantage, stated as a customer benefit>.

MVP should support plan gating later but do not overbuild billing now.

## 10) Core Data Model

> Guidance: list minimum entities with one-line definitions, then an ASCII relationship diagram. Always include: a tenant boundary entity (all data scoped to it), a User entity, and — if the product's value depends on history — an append-only event log. Distinguish "people the system tracks" from "people who log in" if they differ.

### Entities (minimum)
- **Organization** — tenant boundary; all data scoped to an org
- **User** — belongs to Organization; linked to the auth identity
- **<Entity>** — <definition>
- **<…>**

### Key Relationships
```
Organization  1 ──── * User
Organization  1 ──── * <Entity>
<Entity>      1 ──── * <Entity>
<Entity>      * ──── * <Entity> (via <JoinModel>)
```

### Audit Trail / EventLog (include if history is part of the value proposition)
Append-only table — no updates or deletes by application code.

Fields: `id`, `orgId` (partition key), `actorUserId`, `entityType`, `entityId`, `action`, `payload` (JSON diff or snapshot), `createdAt` (sort key — auto-set, never modified).

Secondary indexes:
- `byOrg`: orgId + createdAt — "all events for this org"
- `byEntity`: entityType + entityId + createdAt — "history for this record"

Authorization: event log records are **read-only for all users**; writes happen only through server-side logic. Avoid hard deletes across all entities — soft-delete (`isDeleted`) if needed, but always keep event log records.

## 11) Security / Auth Model (MVP-grade)
- **Auth provider:** <…>
- **Tenant isolation:** all queries filtered by `orgId`; auth rules enforce tenant boundaries
- **File uploads:** private access paths scoped per org
- **Audit trail:** cannot be edited or deleted by any user role

### Role Model
> Guidance: three roles is almost always enough for an MVP. Do not overbuild RBAC.

| Role | Permissions |
|------|------------|
| **Admin** | Full CRUD on all org data; manage users; <…> |
| **<Operator role>** | CRUD on <domain entities>; <…> |
| **Viewer** | Read-only access to all org data |

## 12) UX Requirements (Simple)
Main nav (limit to ~6 top-level items; secondary links in settings/contextual menus):
- <Nav item 1 — usually Dashboard>
- <Nav item 2>
- <…>

Key flows (numbered, end-to-end):
1. <flow 1>
2. <flow 2>
3. <…>

### UX Guidelines
- Generous white space; line heights 1.5× to reduce cognitive load
- All color combinations meet **WCAG 4.5:1**
- High-contrast CTAs with first-person value-oriented microcopy ("Start my trial", not "Submit")
- Responsive layouts for tablet and phone (<where the ICP actually works>)
- Onboarding tour covering the 2–3 core actions
- F-pattern design: critical info in top lines, front-loaded keywords in headings
- Gestalt proximity: group related elements; separate sections with white space
- Plan for dark mode with the same color-psychology principles

### Typography
- **Body:** <sans-serif, 16px minimum>
- **Headings:** <serif if authority/trust is the brand goal; otherwise sans>
- No decorative fonts except in logo

### Microcopy Principles
- Explain form fields (why the info is needed)
- Error messages: neutral, guiding — never blame the user
- Trust signals throughout: <your product's specific factual claims>
- Calm, clear tone — friendly means considerate, not jokey

## 13) Brand Voice (for in-app copy and messaging)
- **Tone:** <e.g., reassuring, straightforward, professional>
- **Verbs:** <4–6 verbs from the brand verb list>
- **Avoid:** jargon, AI buzzwords, enterprise-speak
- **Focus on outcomes:** "<felt-outcome phrase>"
- **Speak to anxieties** of <ICP>; show <Product> has their back
- **CTAs:** first-person, value-oriented
- See `brand-strategy.md` and `landing-page-strategy.md` for full identity and homepage strategy

## 14) Build Principles / Engineering Guidelines
- MVP must be shippable fast with clean structure
- <Stack-specific conventions to follow>
- Focus areas, in order: <auth>, <core data write path>, <relationships/tagging>, <audit log>, <export/output>
- Seed data: script using the generated client to populate test data
- <Migration/schema-change approach>

## 15) How the AI Assistant Should Help (Instructions)
> Guidance: this section is read by AI coding assistants. Keep it.

- Keep scope limited to the MVP essentials above
- Prioritize <the product's correctness-critical property — e.g., audit trail and versioning correctness>
- Propose incremental milestones (MVP1, MVP2)
- Avoid overengineering (no microservices, no premature scaling)
- Use <stack> conventions: <key APIs/patterns>
- Include seed data scripts where helpful
- Provide clear local dev setup and deployment steps
- Use "<Product>" as the product name in all UI text and copy

## 16) Success Criteria (MVP Definition of Done)
MVP is done when a <ICP job title> can:
- <observable capability 1>
- <observable capability 2>
- <observable capability 3>
- <observable capability 4>
- <observable capability 5 — usually "produce the key output">
- <observable capability 6 — usually "see the audit/history view">

> Guidance: every criterion must be observable by the target user, phrased as something they can *do* — not something the codebase *has*.

## 17) Future Roadmap (Post-MVP)
> Guidance: park good ideas here so they stop threatening the MVP. One bold name + one line each.

- **<Feature>** — <one line>
- **<Feature>** — <one line>
- **AI features** — <summarization, gap analysis, auto-mapping — if ever>
- **<Enterprise features>** — <SSO, advanced modules>

End of brief.
