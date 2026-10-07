import { defineAuth, secret } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';
import { preTokenGeneration } from './pre-token-generation/resource';
import { federationPlan } from './federation-plan';
import { GROUPS } from '../shared/constants';

/**
 * Sign-in: email and password always; Google and Microsoft Entra ID when
 * the branch turns them on (AUTH_FEDERATED_PROVIDERS, see
 * ./federation-plan.ts). Two-step sign-in with an authenticator app (TOTP)
 * is available to everyone; whether an organization requires it is that
 * organization's policy, applied by the pre token generation trigger.
 * Setup and the policy model: docs/sign-in-and-mfa.md.
 *
 * Secrets are referenced only for providers that are turned on, so an
 * environment that has not set them up keeps deploying.
 */
const plan = federationPlan({
  AUTH_FEDERATED_PROVIDERS: process.env.AUTH_FEDERATED_PROVIDERS,
  AUTH_MICROSOFT_TENANT_ID: process.env.AUTH_MICROSOFT_TENANT_ID,
  APP_URL: process.env.APP_URL,
  AWS_BRANCH: process.env.AWS_BRANCH,
});

const externalProviders =
  plan.google || plan.microsoft
    ? {
        // COGNITO_ADMIN keeps the hosted-UI access token usable for the
        // user's own Cognito calls (attributes, TOTP setup), like a
        // password sign-in's token.
        scopes: ['EMAIL', 'OPENID', 'PROFILE', 'COGNITO_ADMIN'] as (
          | 'EMAIL'
          | 'OPENID'
          | 'PROFILE'
          | 'COGNITO_ADMIN'
        )[],
        callbackUrls: plan.callbackUrls,
        logoutUrls: plan.logoutUrls,
        ...(plan.google
          ? {
              google: {
                clientId: secret('AUTH_GOOGLE_CLIENT_ID'),
                clientSecret: secret('AUTH_GOOGLE_CLIENT_SECRET'),
                scopes: ['openid', 'email', 'profile'],
                attributeMapping: {
                  email: 'email',
                  givenName: 'given_name',
                  familyName: 'family_name',
                },
              },
            }
          : {}),
        ...(plan.microsoft
          ? {
              // Another organization's own OIDC provider is one more entry
              // here; SAML goes in `saml`. Its Cognito provider name becomes
              // its sign-in method id (amplify/shared/auth-policy.ts).
              oidc: [
                {
                  name: 'Microsoft',
                  clientId: secret('AUTH_MICROSOFT_CLIENT_ID'),
                  clientSecret: secret('AUTH_MICROSOFT_CLIENT_SECRET'),
                  issuerUrl: plan.microsoft.issuerUrl,
                  scopes: ['openid', 'email', 'profile'],
                  attributeMapping: {
                    email: 'email',
                    givenName: 'given_name',
                    familyName: 'family_name',
                  },
                },
              ],
            }
          : {}),
      }
    : undefined;

export const auth = defineAuth({
  loginWith: {
    email: true,
    ...(externalProviders ? { externalProviders } : {}),
  },
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
  },
  groups: [...GROUPS],
  triggers: {
    postConfirmation,
    preTokenGeneration,
  },
});
