import {
  GOOGLE,
  MICROSOFT,
  configuredMethodsFromEnv,
  type SignInMethod,
} from '../shared/auth-policy';

/**
 * Which federated sign-in providers this environment builds, read from the
 * synth-time environment (Amplify console variables per branch, or the
 * shell for `ampx sandbox`). Pure, so it is unit-tested without the
 * backend libraries; amplify/auth/resource.ts turns it into Cognito config.
 *
 * Nothing is federated unless AUTH_FEDERATED_PROVIDERS names it, so an
 * environment without the provider secrets keeps deploying unchanged.
 * See docs/sign-in-and-mfa.md for the setup each provider needs.
 */

export type FederationEnv = {
  /** Comma-separated: "google", "microsoft". Empty or unset: none. */
  AUTH_FEDERATED_PROVIDERS?: string;
  /** Entra ID tenant (GUID or verified domain) for Microsoft sign-in. */
  AUTH_MICROSOFT_TENANT_ID?: string;
  /** The environment's public origin, e.g. https://staging.example.com. */
  APP_URL?: string;
  /** Set by Amplify Hosting on deployed branches; absent in a sandbox. */
  AWS_BRANCH?: string;
};

export type FederationPlan = {
  /** Every sign-in method the environment offers, password included. */
  methods: SignInMethod[];
  google: boolean;
  microsoft: { issuerUrl: string } | null;
  callbackUrls: string[];
  logoutUrls: string[];
};

/** Where the provider sends the person back after signing in. */
export const SIGN_IN_CALLBACK_PATH = '/dashboard';

const LOCAL_ORIGIN = 'http://localhost:3000';

/** Multi-tenant authorities issue tokens whose issuer varies per tenant,
 *  which Cognito cannot validate. One tenant per provider entry. */
const MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);

export function federationPlan(env: FederationEnv): FederationPlan {
  const methods = configuredMethodsFromEnv(env.AUTH_FEDERATED_PROVIDERS);
  const google = methods.includes(GOOGLE);
  let microsoft: FederationPlan['microsoft'] = null;

  if (methods.includes(MICROSOFT)) {
    const tenant = (env.AUTH_MICROSOFT_TENANT_ID ?? '').trim();
    if (!tenant) {
      throw new Error(
        'AUTH_FEDERATED_PROVIDERS includes "microsoft" but AUTH_MICROSOFT_TENANT_ID is not set.'
      );
    }
    if (MULTI_TENANT.has(tenant.toLowerCase()) || !/^[A-Za-z0-9.-]+$/.test(tenant)) {
      throw new Error(
        `AUTH_MICROSOFT_TENANT_ID "${tenant}" must be one tenant's ID or verified domain.`
      );
    }
    microsoft = { issuerUrl: `https://login.microsoftonline.com/${tenant}/v2.0` };
  }

  const origins: string[] = [];
  const appUrl = (env.APP_URL ?? '').trim().replace(/\/+$/, '');
  if (appUrl) origins.push(appUrl);
  if (!env.AWS_BRANCH) origins.push(LOCAL_ORIGIN);
  if ((google || microsoft) && origins.length === 0) {
    throw new Error('Federated sign-in needs APP_URL set for this branch (the callback URL).');
  }
  const unique = [...new Set(origins)];

  return {
    methods,
    google,
    microsoft,
    callbackUrls: unique.map((o) => `${o}${SIGN_IN_CALLBACK_PATH}`),
    logoutUrls: unique.map((o) => `${o}/`),
  };
}
