# Sign-up, organization creation, and permission groups

How a person goes from the marketing page to a working, entitled
organization — the implemented flow, the code behind each step, and the
Cognito permission model. The invite path at the end is **planned, not
built**.

## The flow at a glance

```
Marketing page → "Login" / auth modal (AuthModal)
    │  sign up: email + password
    ▼
Cognito sends a verification code → user confirms (confirmSignUp)
    │
    ▼  PostConfirmation trigger (amplify/auth/post-confirmation/)
    │   • creates the DynamoDB User record { cognitoSub, email, orgId: null }
    │   • adds the user to the Viewer group (safe default)
    ▼
First sign-in → AuthContext loads { email, userId (sub), groups }
    │
    ▼  Any /(app) route → AppGate (app/(app)/layout.tsx)
    │   EntitlementsProvider queries usersByCognitoSub → orgId is null
    │   → redirect to /onboarding
    ▼
/onboarding (app/onboarding/page.tsx)
    │  one field: organization name → provisionOrganization mutation
    │
    ▼  provisionOrganization Lambda (amplify/functions/create-organization/)
    │   1. resolves the caller's User record (from the Cognito sub)
    │   2. slugifies the name; finds a free slug via organizationsBySlug
    │   3. creates the Organization
    │   4. updates User { orgId, role: "Admin" }
    │   5. AdminAddUserToGroup → Admin        (idempotent per user: calling
    │      again returns the existing org)
    ▼
Client: refreshUser({ forceRefresh: true })   ← REQUIRED: pulls new tokens so
    │                                            the Admin group claim exists
    ▼
/dashboard — org name in the sidebar, modules listed (locked until entitled)
    │
    ├── real customers: /subscribe → Stripe checkout → webhook mirrors the
    │   subscription (tier, status, add-on modules) → entitled
    └── pilots / dev orgs: Settings → "Pilot & development access" (Admin
        card) writes Organization.settings overrides → entitled
```

## What each layer contributes

| Step | Code | Notes |
|---|---|---|
| Auth modal (sign up / confirm / reset) | `app/components/AuthModal.tsx`, `AuthContext.tsx` | Modal-first; deep-linkable `/login` pages are an open roadmap decision |
| User record + default group | `amplify/auth/post-confirmation/handler.ts` | Discovers the User table at runtime (no cross-stack ref); default group from `amplify/shared/constants.ts` (`Viewer`) |
| Onboarding gate | `app/(app)/layout.tsx` (`AppGate`) + `app/components/EntitlementsContext.tsx` | `needsOnboarding` = signed in ∧ `User.orgId` null |
| Org creation | `provisionOrganization` mutation → `amplify/functions/create-organization/handler.ts` | Named to avoid the generated `createOrganization` CRUD mutation. Runs with IAM, so it can write while the caller is still a Viewer |
| Token refresh | `AuthContext.refreshUser({ forceRefresh: true })` | Without it the cached token lacks the Admin group and everything stays read-only |
| Entitlements | `EntitlementsContext` → `resolveEntitledModules()` (`lib/modules`) | User → Organization → latest OrgSubscription; module set = included (if active) ∪ subscription `modules[]` ∪ `settings.modules` |
| Backend enforcement | `amplify/data/entitlements/` | Gated mutations re-check the same rules server-side; errors: `OnboardingRequired` / `SubscriptionRequired` / `ModuleRequired` |
| Operator overrides | `app/components/ModuleAccessCard.tsx` on `/settings` | Operator-group only; manages the org's `OrgEntitlementOverride` (comped/base access, modules, reason, expiry). Note: the in-app card requires the operator to be a member of that org — cross-org grants go through the AppSync console until an internal operator surface exists |

### Trying it end to end (developer checklist)

1. Sandbox running (`npx ampx sandbox`), secrets set (see README).
2. `npm run dev` → sign up with a real inbox → paste the code.
3. You land on `/onboarding` → name the org → `/dashboard` as Admin.
4. Settings → Pilot & development access → enable base access + a module.
5. The module unlocks in the sidebar; open it and create records.

Common trip-ups: skipping the sandbox (no backend), an unconfirmed email
(PostConfirmation never fired → no User record), and testing with a user
that predates a schema deploy.

## Cognito permission groups

Four groups, defined in `amplify/shared/constants.ts` and mirrored in
`config/site.ts`. Precedence: Operator=0, Admin=1, Member=2, Viewer=3
(lowest wins). Groups gate **capability** (what you may do); entitlements
gate **access** (what the org has bought) — the two are independent axes.

### Operator — platform staff only

Deliberately excluded from every org/vertical model rule (zero standing
access to customer data). The **only** model that grants Operator anything
is `OrgEntitlementOverride` (full CRUD) — the mechanism for pilots, comps,
and offline check/PO purchases. Assigned manually, never by sign-up flows:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id <pool> \
  --username <username-or-sub> --group-name Operator \
  --profile <profile> --region <region>
```

(Or Cognito console → User pools → user → Add to group.) The operator
must sign out/in afterwards to pick up the group claim.

### Admin — organization owner

| Resource | Permissions |
|----------|-------------|
| Organization / User / Site | create, read, update, delete |
| All vertical/module models | create, read, update, delete |
| EventLog / OrgSubscription / StripeWebhookEvent | read |
| NewsletterSubscriber | read, update |
| Settings overrides (pilot access card) | write |

### Member — day-to-day operator

| Resource | Permissions |
|----------|-------------|
| Organization / User / Site | read |
| Most vertical/module models | create, read, update (delete per model) |
| EventLog / OrgSubscription | read |

### Viewer — read-only

Read across org data; can never export (module rule). Every new sign-up is
a Viewer until an org creation (→ Admin) or, later, an invite assigns a
role.

Each module declares its own matrix over its models following the pattern
(Admin full CRUD; Member the working set; Viewer read) — see the module's
schema file under `amplify/data/modules/`.

## Planned: joining an existing organization (invites)

Not built yet — today a second sign-up ends at `/onboarding` where their
only option is creating a *new* org. The design:

- An Admin generates an invite (org ID + intended role + one-time code).
- The new user chooses "I have an invite code" on onboarding; the backend
  links their User to the org, assigns the invited role's Cognito group,
  and consumes the code.
- Edge cases to honor: invite before sign-up, org switching/transfer, role
  changes from a user-management UI.

Until then: demo and pilot with the org-creating Admin account, or move a
user's `orgId` + group by hand (AppSync console / Cognito console).

## Edge cases (implemented behavior)

| Scenario | Handling |
|----------|----------|
| Signed in, no org | Every `/(app)` route redirects to `/onboarding`; `/onboarding` is idempotent (an already-onboarded user is bounced to `/dashboard`) |
| Never confirms email | Cognito keeps them UNCONFIRMED; no User record exists |
| Org created, no subscription | Shell shows the "No active plan" banner; reads work, gated writes fail with `SubscriptionRequired` |
| Calls `provisionOrganization` twice | Returns the existing org (idempotent per user) |
| Group claim looks stale after onboarding | The client must force-refresh tokens; if a user reports read-only behavior right after onboarding, sign out/in |
