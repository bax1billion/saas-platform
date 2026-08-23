# Onboarding Flow & Cognito Permission Groups

## Cognito Permission Groups

The foundation uses three Cognito groups for role-based access control: **Admin**, **Member**, and **Viewer**. Every GraphQL model in the schema specifies which groups can perform which operations.

> Group names are defined in `amplify/shared/constants.ts`.

### Admin

The organization owner / primary account holder. Full CRUD on all org data, including the foundation models and every vertical model.

| Resource | Permissions |
|----------|-------------|
| Organization | create, read, update, delete |
| User | create, read, update, delete |
| Site | create, read, update, delete |
| All vertical models | create, read, update, delete |
| EventLog | read |
| OrgSubscription | read |
| StripeWebhookEvent | read |
| NewsletterSubscriber | read, update |

### Member

Day-to-day operators. Can manage most domain content but cannot manage the organization itself or billing.

| Resource | Permissions |
|----------|-------------|
| Organization | read |
| User | read |
| Site | read |
| Most vertical models | create, read, update, delete |
| Sensitive vertical models (per vertical) | reduced (e.g., create, read, update only) |
| EventLog | read |
| OrgSubscription | read |

### Viewer

Read-only access across all domain data. Useful for auditors, executives, or external reviewers.

| Resource | Permissions |
|----------|-------------|
| All vertical models | read |

### Per-Vertical Permission Matrices

Each vertical module defines a matrix like the above over its own models, following the pattern: Admin gets full CRUD, Member gets CRUD on day-to-day content with reduced rights on sensitive or approval-related models, Viewer gets read-only. Two example rows from the compliance vertical:

| Resource (example, compliance vertical) | Admin | Member | Viewer |
|----------|-------|--------|--------|
| Document, DocumentVersion | create, read, update, delete | create, read, update, delete | read |
| Approval | create, read, update, delete | create, read, update | read |

### Group Assignment

- **On signup:** The PostConfirmation trigger assigns every new user to the **Viewer** group. This is a safe default that allows them to read data once they join an org.
- **On onboarding (create org):** The user is promoted to **Admin** via `AdminAddUserToGroup`. They retain Viewer membership but Admin takes precedence (lowest precedence number wins — Admin=0, Member=1, Viewer=2).
- **On onboarding (join org via invite):** The user is assigned the role specified in the invitation (Admin, Member, or Viewer).
- **Role changes:** An Admin can change a user's Cognito group membership through the app's user management UI.

---

## Onboarding Flow

### Overview

After signing up with email + password, the user has a Cognito account and a minimal DynamoDB User record (cognitoSub, email, no org). The frontend detects `orgId === null` and routes them to onboarding.

```
Signup (email + password)
    |
    v
PostConfirmation trigger
    |-- Creates User record (cognitoSub, email, no orgId)
    |-- Adds user to Viewer group
    |
    v
First sign-in
    |
    v
Frontend checks: does user have orgId?
    |
    +-- No  --> Onboarding flow
    |            |
    |            +-- Path A: "Create an organization"
    |            |
    |            +-- Path B: "I have an invite code"
    |
    +-- Yes --> Dashboard (normal app experience)
```

### Path A — Create a New Organization

For users starting fresh (e.g., a team lead setting up their company).

**Step 1: Your Details**
- First name, last name, job title
- These are stored on the User record (not Cognito attributes)

**Step 2: Organization Details**
- Organization name (required)
- Industry, address, phone, website (optional)
- A URL slug is auto-generated from the org name

**Step 3: Provisioning**
Backend actions (can be handled by a single mutation or the frontend calling multiple mutations):
1. Create the Organization record
2. Update the User record: set orgId, firstName, lastName, role = "Admin"
3. Promote user to Admin Cognito group (via a Lambda-backed custom mutation or API call)
4. The existing `organization-trigger` fires on the new Organization INSERT and provisions the vertical's default seed records. (Example, compliance vertical: default standards — ISO 9001, ISO 13485, OSHA, FDA, EPA, Internal.)

**Result:** User lands on the dashboard as an Admin of their new org with the vertical's defaults ready to go.

### Path B — Join via Invite Code

For users who were invited by an existing org's Admin.

**Prerequisites:**
- An Admin in the inviting org generates an invite (future feature: Invite model or a simple code/link mechanism)
- The invite contains: org ID, intended role, and a unique invite code

**Step 1: Enter Invite Code**
- User pastes the invite code
- Frontend validates the code (looks up the invite record)
- Displays the org name and assigned role for confirmation

**Step 2: Your Details**
- First name, last name, job title

**Step 3: Join**
Backend actions:
1. Update the User record: set orgId, firstName, lastName, role (from invite)
2. Assign the appropriate Cognito group based on the invite role
3. Mark the invite as consumed

**Result:** User lands on the dashboard as a member of the existing org with the invited role.

### Edge Cases

| Scenario | Handling |
|----------|----------|
| User signs in but skips onboarding | `orgId` remains null. Frontend always checks and redirects back to onboarding. They can only access onboarding until completed. |
| User signs up, never confirms email | Cognito handles this — user stays in UNCONFIRMED state. PostConfirmation trigger never fires. No DynamoDB record created. |
| Invited user signs up before receiving invite | They go through Path A or wait. If they later receive an invite, an Admin can move them to the new org (future admin feature). |
| User needs to switch organizations | Future feature. Could support multiple org memberships or org transfer. |

---

## Data Model Context

### User Record Lifecycle

```
1. PostConfirmation trigger creates:
   {
     id: <uuid>,
     cognitoSub: "abc-123",
     email: "user@example.com",
     isActive: true,
     sortDate: "2026-02-26T...",
     orgId: null,          <-- no org yet
     firstName: null,       <-- collected during onboarding
     lastName: null,
     role: null,
   }

2. After onboarding (Path A - create org):
   {
     ...
     orgId: "org-uuid",
     firstName: "Jane",
     lastName: "Smith",
     role: "Admin",
     jobTitle: "Operations Lead",
   }

2. After onboarding (Path B - join via invite):
   {
     ...
     orgId: "existing-org-uuid",
     firstName: "Jane",
     lastName: "Smith",
     role: "Member",   <-- set by inviter
     jobTitle: "Engineer",
   }
```

### Key Queries

- **Check if user needs onboarding:** `usersByCognitoSub(cognitoSub: sub)` → check if `orgId` is null
- **List org members:** `usersByOrg(orgId: id)` → returns all users in an org
- **Find user by email (for invites):** Add a `byEmail` secondary index on User if needed
