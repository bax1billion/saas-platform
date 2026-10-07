# Sign-in methods and two-step sign-in

How people sign in, how an organization chooses which ways are allowed, and
what an environment needs before federated sign-in works.

## What exists

| Piece | Where |
|---|---|
| Email and password, always on | `amplify/auth/resource.ts` (`loginWith.email`) |
| Google and Microsoft Entra ID (OIDC), per environment | `amplify/auth/resource.ts`, built from `amplify/auth/federation-plan.ts` |
| Two-step sign-in with an authenticator app (TOTP) | `multifactor: { mode: 'OPTIONAL', totp: true }` on the user pool |
| Organization policy (allowed methods, two-step Off / Optional / Required) | `Organization.signInMethods`, `Organization.mfaPolicy` (read-only to clients) |
| Policy rules, shared by browser, command and trigger | `amplify/shared/auth-policy.ts` (client import: `@/lib/auth-policy`) |
| Saving the policy | `setOrgAuthPolicy` command, `amplify/functions/org-auth-policy/` |
| Applying the policy at sign-in and token refresh | Cognito pre token generation trigger, **version 2**, `amplify/auth/pre-token-generation/` (wired as `PreTokenGenerationConfig` `V2_0` in `amplify/backend.ts` #7b) |
| Admin screen | Settings, "Sign-in and security" (`app/components/SignInPolicyCard.tsx`) |
| Personal two-step setup | Settings, "Two-step sign-in" (`app/components/TwoStepCard.tsx`); required setup page in `app/(app)/layout.tsx` |

SMS and voice codes are not offered: no message provider is chosen yet.

## The organization policy

Every organization starts on the **recommended setup**: every sign-in method
the environment offers, two-step sign-in **Optional**. Nothing is stored
until an Admin saves a change; a null policy means the recommended one.

- **Sign-in methods.** Method ids are `password`, `google`, `microsoft`. A
  federated method's id is its Cognito provider name in lower case, so an
  organization's own SAML or OIDC provider added later (provider name
  `Acme-Entra`) becomes `acme-entra` with no schema change.
- **Two-step sign-in.**
  - *Off*: nobody is asked to set it up. Cognito still asks anyone who
    already turned it on.
  - *Optional*: anyone can turn it on for their own account in Settings.
  - *Required*: a person who signs in with email and password and has no
    authenticator app gets tokens **with no groups** and an ID token claim
    `mfa_setup_required: "true"`. Every AppSync group rule denies them, and
    the app shows only the setup page. After setup the app refreshes the
    session and the trigger issues normal tokens.
  - Google and Microsoft sign-ins are not challenged by Cognito; they rely
    on the provider's own two-step policy. An organization that requires
    two-step sign-in should require it in its Google Workspace or Entra
    tenant as well.

### Where it is enforced

1. **Saving** (`setOrgAuthPolicy`, Admin group only). The org comes from
   the caller's own User row, never from the request. The command refuses an
   empty method list, a method the environment does not offer, an unknown
   two-step value, and turning off the method the Admin is signed in with.
   The columns are `READ_ONLY` field rules, so the command (over IAM) is the
   only writer.
2. **Every token issue** (pre token generation trigger: sign-in, hosted-UI
   sign-in, refresh). A method the organization turned off is refused with
   a message the sign-in screen shows. The two-step rule above is applied.
   A change reaches a signed-in person at their next token refresh (within
   the hour by default).

   **Why the trigger is version 2.** `defineAuth` attaches a pre token
   generation trigger as the legacy version 1, which can change the ID
   token only. Amplify's data client authorizes AppSync with the **access**
   token (`@aws-amplify/api-graphql`, `graphqlAuth`), so a version 1 group
   override would leave every data rule exactly as it was and "Required"
   would be a screen, not a rule. `amplify/backend.ts` therefore sets
   `LambdaConfig.PreTokenGenerationConfig` to the same function with
   `LambdaVersion: V2_0`, which applies `groupOverrideDetails` to both
   tokens and lets the marker claims ride on the access token as well
   (visible to a Lambda or pipeline step as `ctx.identity.claims`). Access
   token customization needs the Essentials or Plus feature plan; the pool
   is pinned to `ESSENTIALS`, which is also CloudFormation's default for a
   pool created without a tier. Version 2 events carry the same request
   fields the handler reads (`userAttributes`, `userName`, `triggerSource`).
3. **Fail-safe reading.** The trigger never applies a policy that would
   lock everyone out: methods the environment no longer offers are ignored,
   and if none is left, password sign-in stays on. A user with no
   organization yet (onboarding) is not restricted.
4. **Fail closed when the check cannot run.** If the trigger's own lookups
   fail (the User or Organization table, or Cognito's two-step status), it
   logs the error and issues tokens with **no groups** plus an
   `auth_check_unavailable` claim. Every data rule denies such a token, and
   the app gate shows "We couldn't verify your sign-in. Please try again."
   with a Try again button (a forced token refresh, then a reload) and Sign
   out, instead of a half-loaded screen. Letting the sign-in through with
   normal groups would skip an organization's two-step requirement or a
   method it turned off; and when these lookups fail the data store is
   most likely unreachable anyway, so refusing costs almost nothing. The
   refusal is per token and nothing is stored: the next sign-in or token
   refresh runs the lookups again, so an outage cannot leave a pool locked
   out after it ends. A failure that does not clear on its own (for
   example the tables are not found) shows up as the trigger's error log
   and affects users with an organization and those still onboarding alike.
5. **Custom operations.** Model rules deny a token with no groups by
   themselves. `getMediaAccess`, which any signed-in user may call, now also
   refuses a caller with no org group.

## Setting up an environment

Federation is off unless the branch turns it on, so an environment without
these values keeps deploying exactly as before.

### Amplify console, per branch (environment variables, read at synth)

| Variable | Value |
|---|---|
| `AUTH_FEDERATED_PROVIDERS` | `google`, `microsoft`, or `google,microsoft` |
| `AUTH_MICROSOFT_TENANT_ID` | The Entra tenant ID (GUID) or a verified domain. Required with `microsoft`. Multi-tenant authorities (`common`, `organizations`) are refused: Cognito cannot validate their issuer. |
| `APP_URL` | Already used by checkout. The callback is `${APP_URL}/dashboard`, sign-out returns to `${APP_URL}/`. Sandboxes also allow `http://localhost:3000`. |

### Secrets (Amplify console secrets, or `npx ampx sandbox secret set <NAME>`)

Only the names for providers that are turned on are read.

| Secret | From |
|---|---|
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google Cloud console, OAuth client (Web application) |
| `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET` | Entra admin center, App registration: Application (client) ID and a client secret |

### At each provider

After the first deploy with federation on, the user pool has a Cognito
domain (`<prefix>.auth.<region>.amazoncognito.com`, in `amplify_outputs.json`
under `auth.oauth.domain`). Register its IdP response URL with each
provider:

- **Google:** authorized redirect URI
  `https://<cognito-domain>/oauth2/idpresponse`; authorized JavaScript
  origin `https://<cognito-domain>`. Scopes: openid, email, profile.
- **Microsoft Entra ID:** redirect URI (Web)
  `https://<cognito-domain>/oauth2/idpresponse`. Under Token configuration
  add the optional `email` claim to the ID token (Cognito requires an email,
  and Entra omits it for some accounts). Scopes: openid, email, profile.

### Order of operations

1. Create the provider apps (the redirect URI can be added after step 3).
2. Set the secrets and the variables for the branch.
3. Deploy. Read the Cognito domain from the outputs.
4. Add the redirect URI at each provider.
5. Sign in with each provider once to confirm.

## Amplify conventions, and where this departs from them

Recorded 2026-10-07 at review so the next person knows which parts are
plain Amplify and which are ours, and why.

### What is the documented Amplify shape

| Piece | Convention followed |
|---|---|
| Providers | `defineAuth` → `loginWith.externalProviders`: `google` with `clientId` / `clientSecret` from `secret()`, Microsoft as an `oidc` entry (`name`, `issuerUrl`, `scopes`, `attributeMapping`), plus `callbackUrls` and `logoutUrls`. Secrets are Amplify secrets, never environment variables |
| MFA | `multifactor: { mode: 'OPTIONAL', totp: true }` on the pool |
| Trigger | A `defineFunction` with `resourceGroupName: 'auth'`, attached through `triggers: { preTokenGeneration }` |
| Client, federation | `signInWithRedirect({ provider: 'Google' })`; `{ custom: '<provider name>' }` for an OIDC or SAML entry; the `aws-amplify/auth/enable-oauth-listener` import the docs require for Next.js so the redirect back completes on any page |
| Client, two-step | `signIn` → `CONFIRM_SIGN_IN_WITH_TOTP_CODE` → `confirmSignIn`; enrollment through `setUpTOTP`, `getSetupUri`, `verifyTOTPSetup`, `updateMFAPreference({ totp: 'PREFERRED' })`; status through `fetchMFAPreference` |
| Pool changes | MFA off → Optional, the two trigger entries and the explicit tier are in-place updates of the existing pool; no replacement, no user migration |

### Where we depart, and why

1. **Per-organization two-step policy instead of a pool-wide rule.**
   Amplify's native way to require MFA is `mode: 'REQUIRED'` on the pool,
   which gives every sign-in Cognito's own setup step
   (`CONTINUE_SIGN_IN_WITH_TOTP_SETUP`). One pool serves every tenant, and
   a small volunteer organization and a regulated one will not want the
   same rule, so the pool stays Optional and the organization's choice is
   enforced in the pre token generation trigger: a person under Required
   without an app gets tokens with **no groups** plus a marker claim until
   they enroll. Cost: the trigger is a custom layer on a native hook, it
   runs on every token issue, and its failure mode is ours to own
   (section "Where it is enforced", point 4). Revisit if Cognito ever
   offers a per-group or per-tenant MFA rule, or if a second pool per
   tenant tier becomes acceptable.
2. **Trigger version 2 through the CDK escape hatch.** `defineAuth`
   attaches the trigger as version 1 and offers no option for version 2,
   but version 1 edits the ID token only and Amplify's data client
   authorizes AppSync with the access token. `amplify/backend.ts` sets
   `LambdaConfig.PreTokenGenerationConfig` with `V2_0` on
   `cfnResources.cfnUserPool` and pins the tier to Essentials, which
   access token customization needs. The override is Amplify's documented
   way to change what `defineAuth` does not expose. Revisit when
   `defineAuth` grows a version option.
3. **The trigger reads DynamoDB directly and finds tables with
   `ListTables`.** Amplify's documented pattern for a trigger that needs
   data is the data client inside the function with an `allow.resource`
   grant on the schema. The repo's post-confirmation trigger already uses
   `ListTables` because giving an auth-stack function the AppSync endpoint
   produced a circular dependency on deploy
   (`amplify/auth/post-confirmation/handler.ts` records the attempts), and
   this trigger follows that precedent. Cost: in a dev account with
   several sandboxes live, `ListTables` can pick another sandbox's table.
   Revisit for both triggers together: the documented data-client route,
   or the `ListStackResources` fix the post-confirmation comment describes.
4. **The trigger's Cognito grant is a wildcard pool ARN.** Naming the pool
   ARN in the function's role policy closes a cycle (the pool's
   `LambdaConfig` points at the function, and CDK makes the function depend
   on its own default policy); `npm run check:backend` rejects it. Same
   shape as the post-confirmation grant.
5. **A custom sign-in modal, not the Amplify UI Authenticator.** The repo
   already had its own `AuthModal`; this change adds the provider buttons
   and the code step to it rather than switching components. The
   Authenticator would handle every Cognito step (new password required,
   TOTP setup when the pool requires it) for free; the modal handles the
   steps this configuration can produce and shows an honest "not
   supported yet" message for any other.
6. **The policy lives on `Organization`, written by a command.** Cognito
   has no per-organization setting, so the policy is four read-only
   columns on the org row and a command mutation that validates and
   writes them over IAM. This is the repo's own command convention
   (`docs/modules.md`), chosen because a bad or cross-org change must be
   refused before anything is written.
7. **Two-step is not applied to federated sign-ins.** Cognito does not
   challenge a hosted-UI sign-in with its own MFA, so under Required a
   Google or Microsoft sign-in relies on that provider's policy. Documented
   on the Admin card. Nothing in Amplify changes this; it is a Cognito
   limit.
8. **No account linking.** A federated sign-in creates its own Cognito
   user. Amplify's pre sign-up trigger could link it to a password user by
   email, but only a verified email from the provider makes that safe, and
   Entra does not send one by default. Deferred on purpose.

### Not built, so nothing to depart from yet

SMS and email codes (no message provider chosen), passkeys, Okta or SAML
entries (one more `externalProviders` entry each), a per-role or
per-product MFA rule, session idle and absolute timers (a product's own
compliance work carries those).

## Known limits

- **Separate accounts.** A Google or Microsoft sign-in creates its own
  Cognito user, even when a password account with the same email exists.
  Linking them safely needs the provider to assert a verified email
  (Entra does not by default), so it is not automatic yet. Until then a
  person who switches methods starts without an organization, the same as
  any new sign-up (joining an existing organization needs invites, which
  are not built).
- **Table lookup.** Like the post-confirmation trigger, the pre token
  generation trigger finds the `User-*` and `Organization-*` tables with
  `ListTables`, because the auth stack cannot reference the data stack. In
  a dev account with several sandboxes live at once it can read another
  sandbox's tables (see `amplify/auth/post-confirmation/handler.ts`).
- **`createCheckoutSession`** is callable by any signed-in user and does
  not check that the caller belongs to the `orgId` it is given. That
  predates this change and is not fixed here.
- **No QR code.** Setup shows the key to type or copy and an
  `otpauth://` link for phones; a QR image needs a library this repo does
  not have yet.
- **Not exercised against a sandbox yet.** Synth passes with federation on
  and off; the trigger's group override, the redirect flow and the TOTP
  flow have unit tests for their logic only. Before "Required" is offered
  to a real organization, prove on a sandbox, in this order:
  1. Set an organization to Required with a password user who has no
     authenticator app, sign in, and decode the **access** token: it must
     carry `mfa_setup_required` and no `cognito:groups` (an empty
     `groupsToOverride` is what the handler sends; if Cognito keeps the
     original groups instead, the override shape needs changing before
     anything else ships).
  2. With that token, call `usersByCognitoSub` through AppSync directly
     (not the app): it must be refused.
  3. Finish setup, refresh, and confirm groups are back on both tokens.
  4. Turn a method off for an organization and sign in with it: the
     trigger's error must reach the sign-in screen as the policy message.
