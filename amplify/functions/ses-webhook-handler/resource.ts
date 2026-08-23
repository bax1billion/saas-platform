import { defineFunction } from '@aws-amplify/backend';

export const sesWebhookHandlerFunction = defineFunction({
  name: 'ses-webhook-handler',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
