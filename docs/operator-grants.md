# Operator grants: enabling a module for one customer

The runbook for turning a module on for a single organization in
production without buying it and without the operator joining that org.
This is how pilots, comps and check or purchase-order deals get access
while every module is a preview.

Read `docs/modules.md` → Entitlements for the model behind this. In short:
an org holds a module when it appears on its Stripe subscription **or** on
its live `OrgEntitlementOverride` row. The override is written only by the
`Operator` Cognito group, the app and the AppSync pipeline steps both honor
it, and the module's `stage` (preview or not) plays no part. The checkout
gate only blocks buying; grants go around checkout entirely.

## Before you start

1. **You are an Operator.** A platform staff account in the `Operator`
   Cognito group of that environment's user pool. Assigned by hand, never by
   sign-up (`docs/onboarding-and-permissions.md` → Operator has the
   command). Sign out and in after being added so the token carries the
   group.
2. **You know the environment's endpoints.** Production and staging are
   separate AWS accounts with separate APIs. In that account's console:
   AWS AppSync → APIs → the app's API. The **Queries** tab is where the
   steps below run. For sign-in you need the Cognito **app client id**:
   Amazon Cognito → User pools → the pool → App clients. (A developer can
   read both from that environment's `amplify_outputs.json`: `data.url`
   and `auth.user_pool_client_id`.)
3. **You know the module ids.** They are registry ids, not display names
   (a product may show a different public name or slug). The full list is
   `config/modules.ts`.

## 1. Sign in to the AppSync console as the Operator

AppSync → the API → **Queries** → the authorization dropdown at the top of
the editor → **Amazon Cognito User Pools** → enter the app client id, your
Operator username and password → Login. The editor now runs every query
and mutation with your Operator token, which is the only identity allowed
to write overrides.

## 2. Find the organization's id

By slug (the URL-safe name the org chose at onboarding):

```graphql
query FindOrg {
  organizationsBySlug(slug: "example-org") {
    items { id name slug isActive }
  }
}
```

Or by display name when you do not know the slug:

```graphql
query FindOrgByName {
  listOrganizations(filter: { name: { contains: "Example" } }, limit: 50) {
    items { id name slug isActive }
  }
}
```

Copy the `id`. Every step below uses it.

## 3. Check what the org already has

The **latest row by `sortDate` is the one that counts**, so look before you
write. Prefer updating the existing row to creating a second one.

```graphql
query CurrentGrant($orgId: ID!) {
  entitlementOverridesByOrg(orgId: $orgId, sortDirection: DESC, limit: 1) {
    items { id access modules reason grantedBy expiresAt sortDate updatedAt }
  }
}
```

Variables (the panel under the editor):

```json
{ "orgId": "<the id from step 2>" }
```

Also worth a glance: does the org have a subscription? If it does, the
modules on it are already granted and you only need to add the extra ones.

```graphql
query CurrentSubscription($orgId: ID!) {
  subscriptionsByOrg(orgId: $orgId, sortDirection: DESC, limit: 1) {
    items { status tier modules currentPeriodEnd }
  }
}
```

## 4a. No override yet: create one

`access: "comped"` grants base access to an org that has **no** active
subscription (pilots). Leave it out for a paying org that is only getting
an extra module. `modules` is the complete list the org should hold
through the override, by id. `sortDate` must be now, because latest wins.

```graphql
mutation GrantAccess($input: CreateOrgEntitlementOverrideInput!) {
  createOrgEntitlementOverride(input: $input) {
    id orgId access modules reason grantedBy expiresAt
  }
}
```

```json
{
  "input": {
    "orgId": "<org id>",
    "access": "comped",
    "modules": ["widgets", "reports"],
    "reason": "90 day pilot, agreed with the customer on 2026-09-23",
    "grantedBy": "you@example.com",
    "expiresAt": "2026-12-31T23:59:59Z",
    "sortDate": "2026-09-23T17:00:00Z"
  }
}
```

## 4b. A row exists: update it

Send the **full** `modules` list, not just the addition; the field is
replaced, not merged.

```graphql
mutation UpdateGrant($input: UpdateOrgEntitlementOverrideInput!) {
  updateOrgEntitlementOverride(input: $input) {
    id access modules reason grantedBy expiresAt
  }
}
```

```json
{
  "input": {
    "id": "<override id from step 3>",
    "modules": ["widgets", "reports", "billing"],
    "reason": "Added billing to the pilot, 2026-10-02",
    "grantedBy": "you@example.com"
  }
}
```

## 5. Confirm with the customer

Nothing about their sign-in changes. Entitlements are read when the app
loads, so the customer reloads the app (or signs in) and the module is
open in the sidebar. If it still shows locked, re-run step 3 and check
that `expiresAt` is in the future and the module id is spelled as in the
registry.

## Revoking or ending a grant

- **End it on a date**: set `expiresAt`. A past `expiresAt` grants nothing,
  in the app and in the pipeline steps. This is the normal way a pilot
  ends and leaves the reason on record.
- **Remove one module**: update `modules` without it.
- **Remove everything now**: update with `modules: []` and `access: null`.

Never delete the row. It is the record of what was granted, by whom and
why, and the audit trail keys off it.

## Rules

- One override row per org. Update it; do not stack rows.
- Always fill `reason` and `grantedBy`. A grant with no reason is a
  finding in the next review.
- Put an `expiresAt` on every pilot and comp. Only a paid offline deal
  (check or PO) gets a grant that runs to the end of its term, and that
  term is the `expiresAt`.
- Grants are for one org. There is no "all customers" switch, on purpose.
- Production and staging are different accounts. A grant in one does
  nothing in the other.

## What this does not do

- It does not put the module on sale. Selling a module is the three-edit
  procedure in `docs/modules.md` → Preview modules.
- It does not create a Stripe subscription or invoice. Money for offline
  deals is handled outside the app; the grant's `reason` should cite the
  PO or check.
- The in-app operator card on `/settings` does the same writes for the org
  the operator belongs to. This runbook is for orgs the operator is not a
  member of. An operator-only admin page that picks any org is the
  natural next step if this runbook is used often.
