import { defineFunction } from '@aws-amplify/backend';

export const organizationTriggerFunction = defineFunction({
  name: 'organization-trigger',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
