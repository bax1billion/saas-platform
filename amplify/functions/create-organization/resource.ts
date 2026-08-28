import { defineFunction } from '@aws-amplify/backend';

/**
 * Onboarding: creates the caller's Organization, links their User record,
 * and elevates them to the Admin group. Exposed as the `provisionOrganization`
 * custom mutation (the model's own createOrganization is the generated CRUD one). USER_POOL_ID is injected by amplify/backend.ts.
 */
export const createOrganizationFunction = defineFunction({
  name: 'create-organization',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
