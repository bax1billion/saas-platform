import { defineFunction } from '@aws-amplify/backend';

export const eventLoggerFunction = defineFunction({
  name: 'event-logger',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
