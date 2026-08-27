import { defineFunction } from '@aws-amplify/backend';

/**
 * Onboarding: creates the caller's Organization, links their User record,
 * and elevates them to the Admin group. Exposed as the `createOrganization`
 * custom mutation. USER_POOL_ID is injected by amplify/backend.ts.
 */
export const createOrganizationFunction = defineFunction({
  name: 'create-organization',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
