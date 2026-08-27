# Subscriptions & Payments

## Overview

The platform uses Stripe for billing and a two-layer enforcement system (frontend + backend) to gate platform access behind an active subscription.

**User journey:** Signup → Onboarding (create org) → **Paywall (select plan + pay)** → Dashboard

**Access rules:** ACTIVE, TRIALING, and PAST_DUE statuses grant full access. All other statuses (CANCELED, UNPAID, INCOMPLETE, PAUSED) are locked out and redirected to a resubscribe/payment page.

---

## Architecture

```
User signs in
    │
    ▼
AuthContext loads (Cognito user, groups)
    │
    ▼
SubscriptionProvider loads (queries User → Org → OrgSubscription)
    │
    ├── orgId is null ──────────────► /onboarding
    │
    ├── No active subscription ────► /subscribe (paywall / plan selection)
    │
    ├── Subscription CANCELED/UNPAID ► /resubscribe (update payment)
    │
    └── Subscription ACTIVE/TRIALING/PAST_DUE ──► /dashboard (full access)
```

### Enforcement Layers

1. **Frontend:** SubscriptionProvider context + route group layouts that redirect based on subscription state
2. **Backend:** AppSync pipeline resolver that checks subscription status before allowing mutations (reads are always allowed so users can view/export data after cancellation)

---

## Subscription Tiers

### Naming

Tier names describe the customer's growth stage, not the product's quality level. Every tier is a fully-featured platform — the names signal why you'd upgrade (you're growing), not that you're getting something better.

The enum values below are code-level constants; display names and prices are marketing copy owned by the config layer (`config/pricing.ts`). The dollar values in this doc are illustrative.

| Enum Value | Display Name | Price |
|------------|-------------|-------|
| CORE | Core | $99/mo |
| GROWTH | Growth | $199/mo |
| SCALE | Scale | $399/mo |
| TRIAL | Trial | Free (14 days) |

### Differentiation Strategy

**Gate on scale, not capability.** Every tier is a fully-featured platform. Customers upgrade because they're growing (more users, more sites, more of the vertical's countable resources), not because they're locked out of features they can see but can't use.

This is the foundation's core pricing stance: at the entry tier a customer gets the same feature set — including AI assistance, exports, and workflows — that incumbents in most verticals charge an order of magnitude more for. The difference between tiers is how much of it you can use, not what you can use.

**AI is built into the product, not branded as a feature.** AI-assisted capabilities (whatever the vertical defines — drafting, gap analysis, completeness suggestions, scoring) are available at all tiers. The product is just smart by default — like how Notion or Linear handle AI. No "AI features" toggle, no tier gating.

### Feature Matrix

The foundation rows below apply to every product built on the platform; each vertical adds its own feature rows (all "Yes" at every tier, per the gate-on-scale strategy) and its own resource caps.

|  | Core ($99) | Growth ($199) | Scale ($399) |
|---|---|---|---|
| **Users** | Up to 5 | Up to 25 | Unlimited |
| **Sites** | 1 | Up to 3 | Unlimited |
| **Vertical resource caps** (per vertical) | Capped | Higher / unlimited | Unlimited |
| **Vertical features** (per vertical) | Yes | Yes | Yes |
| **AI assistance** | Yes | Yes | Yes |
| **API access** | Yes | Yes | Yes |
| **SSO / SCIM** | No | No | Yes |
| **Support** | Email | Priority email | Dedicated CSM |

**Example (compliance vertical):** the vertical rows were "Compliance frameworks" (up to 3 / unlimited / unlimited) plus feature rows for document control, version history, approval workflows, training management, evidence collection, and audit export — all "Yes" at every tier.

### Tier Positioning

- **Core** — "Build your foundation." For small teams at a single site. Full-featured platform with AI, API access, and exports.
- **Growth** — "Expand across your organization." For growing teams spanning multiple sites. Same features, more room to grow.
- **Scale** — "At any scale." Unlimited everything plus SSO/SCIM and dedicated support for large organizations.
- **Trial** — 14-day free trial with Growth-level limits so prospects experience the full product before choosing a tier.

Positioning copy is per-product and lives in the config layer (`config/pricing.ts`); the lines above are the pattern.

### Add-on modules

Tiers gate scale; **modules** gate which products an org has bought. A
module is either `included` (every active subscription has it) or an `addon`
— a second Stripe Price on the same subscription whose Product carries
metadata `module=<id>`. `createCheckoutSession` accepts `modules[]`; the
webhook mirrors the subscription's line items into `OrgSubscription.modules`;
`resolveEntitledModules()` turns that (plus `Organization.settings.modules`
overrides) into the entitled set. Full pattern: `docs/modules.md`.

### Tier Enforcement

Tier limits are checked at two levels:

1. **Frontend:** SubscriptionProvider exposes `tier` — UI shows upgrade prompts when approaching limits (e.g., "You've used 4 of 5 seats")
2. **Backend:** Mutation resolvers check tier before allowing operations that exceed scale limits:
   - User count: reject `createUser` / user invite if org has reached the seat cap
   - Site count: reject `createSite` if org has reached the site cap
   - Vertical resource counts: reject `create<Resource>` for each countable vertical resource that has reached its cap (e.g., a compliance vertical caps standards/frameworks)
   - SSO: reject SSO configuration for non-Scale

Tier limits are defined in a shared config (not hardcoded per-resolver) so they can be updated in one place. The foundation defines `maxUsers` and `maxSites`; each vertical extends the shape with caps for its own countable resources:

```typescript
const TIER_LIMITS = {
  CORE:   { maxUsers: 5,  maxSites: 1, sso: false },
  GROWTH: { maxUsers: 25, maxSites: 3, sso: false },
  SCALE:  { maxUsers: -1, maxSites: -1, sso: true  }, // -1 = unlimited
  TRIAL:  { maxUsers: 25, maxSites: 3, sso: false }, // matches Growth
};
// Verticals extend the per-tier shape, e.g. a compliance vertical adds
// maxStandards: 3 / -1 / -1 / -1 alongside the foundation limits.
```

### Competitive Context

Each product built on the foundation should carry its own competitive analysis; the pattern is to position flat, transparent pricing against quote-based incumbents.

**Example (compliance vertical):** at $99-$399/month ($1,188-$4,788/year), the product sat at the affordable end of the QMS market:

| Competitor | Entry Price | Target |
|---|---|---|
| SafetyCulture | $24/user/mo | Broad safety/quality |
| isoTracker | ~$225/mo (10 users) | SMB manufacturing |
| QT9 | ~$3,000/year | SMB manufacturing |
| Qualio | ~$12,000/year | Life sciences |
| Greenlight Guru | ~$12-15K/year | Medical devices |
| MasterControl | ~$25,000/year | Large regulated orgs |
| Vanta | ~$7,500/year | IT compliance |

The flat, transparent pricing is a competitive advantage against the quote-based opacity of most vendors. Most tools at a low price point are basic single-purpose systems — offering a full-featured platform with AI at the entry price is a strong differentiator.

### Schema Changes Required

The `SubscriptionTier` enum in `amplify/data/resource.ts` needs to be updated:

```typescript
// Current (in code)
SubscriptionTier: a.enum(['CORE', 'GROWTH', 'SCALE', 'TRIAL'])
```

The Pricing component (`app/components/Pricing.tsx`) reads tier names, descriptions, prices, and feature lists from `config/pricing.ts` — the per-product pricing copy lives there, not in the component.

---

## Multi-Site Support

### Current State

The schema has no concept of sites. Everything is flat under Organization — one address, no Site model, no `siteId` on any model. A company with 3 physical locations would dump all of its records into one undifferentiated bucket.

This is a gap for any vertical whose customers operate multiple locations, because:
- Different locations may have different applicable rules or configurations
- Some records are location-specific while others are org-wide
- Data collection and reporting often happen per location
- Requirements can vary by location

**Example (compliance vertical):** different plants have different applicable standards (Plant A does ISO 9001, Plant B adds FDA), SOPs are often site-specific, audit evidence is collected per facility, and training requirements vary by location.

### Site Model

New model added to the schema:

```
Site: {
  orgId        (required) — belongs to Organization
  name         (required) — e.g., "Austin Plant"
  siteCode     (string)   — short identifier, e.g., "AUS-01"
  address      (string)   — facility address
  isActive     (boolean)  — soft delete
}
```

Authorization: same as Organization (Admin full CRUD, Member/Viewer read).

Secondary index: `sitesByOrg(orgId)` for listing all sites in an org.

Organization gets a `sites: a.hasMany('Site', 'orgId')` relationship.

### Adding siteId to Vertical Models

An **optional** `siteId` field is added to org-scoped vertical models. Records with `siteId = null` are org-wide (shared across all sites). Records with a `siteId` are site-specific.

When a vertical module defines its models, it decides per model whether records can be site-scoped:

| Model (pattern) | siteId | Rationale |
|---|---|---|
| Top-level vertical entities | optional | Records can be org-wide or site-specific |
| Child/detail models | no | Inherit scope from their parent model |
| Join tables | no | Inherit scope from both sides |
| EventLog (foundation) | optional | For site-level audit trails |

**Example (compliance vertical):** Employee and Document got optional `siteId` (an SOP can be org-wide or site-specific), while DocumentVersion and TrainingRecord inherited scope from their parents.

Each model with `siteId` gets:
- `site: a.belongsTo('Site', 'siteId')` relationship
- A secondary index: `<model>BySite(siteId)` for querying records at a specific site

### Query Patterns

- **All records for an org (current behavior):** `<model>ByOrg(orgId)` — unchanged, returns org-wide + all sites
- **Records for a specific site:** `<model>BySite(siteId)` — new index
- **Org-wide records only:** filter `<model>ByOrg` where `siteId = null`
- **Site picker in UI:** query `sitesByOrg(orgId)`, let user select a site to scope their view

### Default Behavior

- **Single-site orgs (Core):** A default site is created during onboarding (same as the org address). All records are implicitly scoped to it. The site picker is hidden in the UI since there's only one.
- **Multi-site orgs:** The site picker appears in the UI. Users can create records scoped to a specific site or leave them org-wide.

### Schema Changes Summary

**File:** `amplify/data/resource.ts`

1. Add `Site` model (orgId, name, siteCode, address, isActive)
2. Add `sites` relationship to Organization
3. Add optional `siteId` + `site` relationship to site-scopable vertical models (per the pattern above) and EventLog
4. Add `sitesByOrg` secondary index on Site
5. Add `<model>BySite` secondary indexes on models with siteId
6. Add `SITE` to EntityType enum (for EventLog)
7. Update SubscriptionTier enum to: CORE, GROWTH, SCALE, TRIAL

**File:** `amplify/functions/organization-trigger/handler.ts`

Update to create a default Site when a new Organization is provisioned.

---

## Status-to-Experience Mapping

| Subscription Status | Frontend Experience | Backend (Mutations) |
|---------------------|--------------------|--------------------|
| ACTIVE | Full app access | Allowed |
| TRIALING | Full app access | Allowed |
| PAST_DUE | Full access + warning banner | Allowed (grace period) |
| CANCELED | Redirect to /resubscribe | Blocked |
| UNPAID | Redirect to /resubscribe | Blocked |
| INCOMPLETE | Redirect to /subscribe | Blocked |
| INCOMPLETE_EXPIRED | Redirect to /subscribe | Blocked |
| PAUSED | Redirect to /resubscribe | Blocked |
| No subscription | Redirect to /subscribe | Blocked |
| No org (orgId null) | Redirect to /onboarding | Blocked |

---

## Implementation

### 1. SubscriptionProvider Context

**File:** `app/components/SubscriptionContext.tsx`

React context that fetches and caches the user's subscription state after AuthContext loads. Queries:
1. `usersByCognitoSub(cognitoSub)` → get User record (orgId)
2. If orgId exists → `subscriptionsByOrg(orgId)` → get latest OrgSubscription
3. Exposes: `{ org, subscription, tier, status, isActive, needsOnboarding, needsSubscription, isLoading }`

Where `isActive` = status is one of ACTIVE, TRIALING, PAST_DUE.

Added to provider stack in `app/layout.tsx` (wraps inside AuthProvider).

### 2. Route Group Structure

```
app/
├── (public)/              # Marketing pages (no auth required)
│   ├── page.tsx           # Homepage
│   ├── blog/              # Blog
│   └── layout.tsx         # Public layout (Navbar + Footer)
│
├── (auth)/                # Auth-required but no subscription needed
│   ├── onboarding/        # Onboarding wizard
│   │   └── page.tsx
│   ├── subscribe/         # Plan selection + Stripe Checkout
│   │   └── page.tsx
│   ├── resubscribe/       # Reactivation page for lapsed users
│   │   └── page.tsx
│   └── layout.tsx         # Checks isAuthenticated, redirects to login if not
│
├── (app)/                 # Full app — requires auth + active subscription
│   ├── dashboard/
│   │   └── page.tsx
│   ├── <vertical-feature>/  # One route per vertical feature area
│   ├── <vertical-feature>/  # (e.g., a compliance vertical had documents/,
│   ├── <vertical-feature>/  #  training/, evidence/, standards/)
│   ├── settings/
│   │   ├── billing/       # Subscription management, invoices
│   │   └── organization/  # Org settings
│   └── layout.tsx         # Checks isAuthenticated + isActive subscription
│
├── layout.tsx             # Root layout (providers)
└── components/
```

### 3. Subscription Gate — (app) Layout

**File:** `app/(app)/layout.tsx`

- If not authenticated → redirect to /
- If needsOnboarding (orgId === null) → redirect to /onboarding
- If needsSubscription (no subscription or status not active) → redirect to /subscribe
- If PAST_DUE → show banner "Payment failed — please update your payment method"
- Otherwise → render children (full app)

### 4. Subscription Gate — (auth) Layout

**File:** `app/(auth)/layout.tsx`

- If not authenticated → redirect to /
- Otherwise → render children (onboarding, subscribe, resubscribe pages)

### 5. Paywall — /subscribe Page

**File:** `app/(auth)/subscribe/page.tsx`

Uses **Stripe Embedded Checkout** so the entire payment flow stays on-site with a branded experience. No redirect to Stripe's hosted page. Stripe still handles SCA/3DS, payment method rendering, and PCI compliance (SAQ A scope).

**Two-phase UI:**

**Phase 1 — Plan Selection:** Displays the three plans (Core, Growth, Scale — copy and prices from `config/pricing.ts`) with a "Select Plan" button on each.

**Phase 2 — Embedded Checkout:** After selecting a plan:
1. Frontend calls a custom AppSync mutation `createCheckoutSession(tier, orgId)`
2. A Lambda resolver creates a Stripe Checkout Session in **embedded mode** (`ui_mode: 'embedded'`) with the org's stripeCustomerId (or creates a new Stripe customer)
3. Returns the `clientSecret` (not a URL)
4. Frontend renders `<EmbeddedCheckout clientSecret={clientSecret} />` from `@stripe/react-stripe-js`
5. User completes payment inline without leaving the site
6. On completion, Stripe fires `checkout.session.completed` webhook → webhook handler creates OrgSubscription
7. Embedded Checkout redirects to the `return_url` (`/subscribe/success`) where the app polls for the subscription record or verifies via the `session_id` query param

**Dependencies:** `@stripe/stripe-js`, `@stripe/react-stripe-js` (frontend), `stripe` (Lambda resolver)

### 6. Backend Enforcement — AppSync Pipeline Resolver

For mutation operations on org-scoped models (foundation and vertical alike), add a pipeline resolver step that:
1. Extracts the caller's cognitoSub from the AppSync identity context
2. Looks up User → orgId → OrgSubscription
3. Checks if status is ACTIVE, TRIALING, or PAST_DUE
4. If not → return an unauthorized error
5. If yes → continue to the main resolver

Can be implemented as:
- A custom JS resolver function in `amplify/data/` that runs before mutations
- Or a Lambda function called as the first step in a pipeline resolver

**Scope:** Only enforce on mutation operations. Read operations (queries) are always allowed.

### 7. PAST_DUE Banner

**File:** `app/components/PastDueBanner.tsx`

A persistent top-of-page banner shown when subscription status is PAST_DUE:
- "Your payment failed. Please update your payment method to avoid losing access."
- Links to `/settings/billing` or Stripe's customer portal

Rendered in `(app)/layout.tsx` when `subscription.status === 'PAST_DUE'`.

---

## Stripe Integration

### Source of Truth

Stripe is the source of truth for subscription state. The OrgSubscription record in DynamoDB is written only by the Stripe webhook handler (`amplify/functions/stripe-webhook-handler/handler.ts`), never by client code directly.

### Webhook Events

The webhook handler processes these Stripe events to keep OrgSubscription in sync:
- `checkout.session.completed` — create OrgSubscription
- `customer.subscription.updated` — update status/tier
- `customer.subscription.deleted` — mark as CANCELED
- `invoice.payment_failed` — update status to PAST_DUE or UNPAID

### Data Model

The OrgSubscription model (defined in `amplify/data/resource.ts`) stores:
- `orgId` — links to Organization
- `stripeCustomerId`, `stripeSubscriptionId` — Stripe references
- `tier` — CORE, GROWTH, SCALE, or TRIAL
- `status` — TRIALING, ACTIVE, PAST_DUE, UNPAID, CANCELED, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED
- `currentPeriodStart`, `currentPeriodEnd` — billing period
- `cancelAtPeriodEnd` — whether subscription will cancel at end of period

---

## Backend Patterns

### Custom Mutations (AppSync + Lambda)

Internal operations that require custom logic (like creating a Stripe Checkout Session) use **AppSync custom mutations** backed by Lambda functions. This is the standard pattern for all internal backend logic in the platform.

**How it works:**
1. Define a custom mutation in the schema (`amplify/data/resource.ts`) with `a.mutation()` + `a.handler.function()`
2. AppSync handles auth automatically (validates Cognito JWT before the Lambda runs)
3. The Lambda handler is typed end-to-end via `Schema['mutationName']['functionHandler']`
4. The frontend calls it via `client.mutations.mutationName()` with full type safety

**Example:** `createCheckoutSession` — takes `tier` and `orgId`, calls the Stripe API, returns `clientSecret`. Auth, typing, and IAM permissions are all handled by the framework.

**When to use this pattern:** Any operation that needs custom logic beyond simple CRUD — third-party API calls, multi-step workflows, cross-service orchestration.

### Next.js API Routes (Customer-Facing API)

Next.js API routes (`app/api/`) are **not used for internal operations** — those go through AppSync. API routes are reserved for a future **customer-facing REST API** (the "API access" feature listed in every pricing tier). When implemented, these routes would:
- Authenticate via API keys (not Cognito sessions)
- Enforce subscription tier and rate limits
- Provide a RESTful interface for customers to integrate the product with their own systems

---

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| **Schema & Backend** | | |
| `amplify/data/resource.ts` | MODIFY | Add Site model, siteId to site-scopable models, update SubscriptionTier enum, add createCheckoutSession mutation |
| `amplify/functions/organization-trigger/handler.ts` | MODIFY | Create default Site on org provisioning |
| `amplify/functions/create-checkout-session/handler.ts` | CREATE | Lambda — creates Stripe Embedded Checkout session, returns clientSecret |
| `amplify/functions/stripe-webhook-handler/handler.ts` | MODIFY | Implement webhook event processing |
| **Frontend — Providers & Components** | | |
| `app/components/SubscriptionContext.tsx` | CREATE | Subscription state provider |
| `app/components/PastDueBanner.tsx` | CREATE | Payment failed warning banner |
| `app/components/Pricing.tsx` | MODIFY | Render tier names, features, and copy from `config/pricing.ts` |
| `app/layout.tsx` | MODIFY | Add SubscriptionProvider to provider stack |
| **Frontend — Route Groups** | | |
| `app/(public)/layout.tsx` | CREATE | Public pages layout |
| `app/(public)/page.tsx` | MOVE | Homepage from app/page.tsx |
| `app/(auth)/layout.tsx` | CREATE | Auth-required layout |
| `app/(auth)/onboarding/page.tsx` | CREATE | Onboarding wizard |
| `app/(auth)/subscribe/page.tsx` | CREATE | Paywall / plan selection + Stripe Embedded Checkout |
| `app/(auth)/resubscribe/page.tsx` | CREATE | Reactivation page |
| `app/(app)/layout.tsx` | CREATE | Subscription-gated layout |
| `app/(app)/dashboard/page.tsx` | CREATE | Main dashboard |

---

## Verification

1. **No subscription:** Sign in with a user who completed onboarding but has no OrgSubscription → should redirect to /subscribe
2. **Active subscription:** Add a mock OrgSubscription with status ACTIVE → should access /dashboard
3. **Past due:** Change status to PAST_DUE → should see /dashboard with warning banner
4. **Canceled:** Change status to CANCELED → should redirect to /resubscribe
5. **No org:** Sign in with a user with orgId=null → should redirect to /onboarding
6. **Backend enforcement:** Try calling a mutation on any org-scoped model directly via AppSync console with a canceled subscription → should fail with authorization error
