import { defineFunction } from '@aws-amplify/backend';

/**
 * `setOrgAuthPolicy`: an org Admin changes which sign-in methods the org
 * allows and its two-step sign-in policy. Validates against the methods
 * this environment offers (the same AUTH_FEDERATED_PROVIDERS value the
 * user pool is built from) and refuses a change that would end the
 * caller's own access. Writes over IAM, the only path to those columns.
 * GRAPHQL_ENDPOINT is set by amplify/backend.ts.
 */
export const orgAuthPolicyFunction = defineFunction({
  name: 'org-auth-policy',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  resourceGroupName: 'data',
  environment: {
    AUTH_FEDERATED_PROVIDERS: process.env.AUTH_FEDERATED_PROVIDERS ?? '',
  },
});
