import { defineFunction } from '@aws-amplify/backend';

export const s3FileTriggerFunction = defineFunction({
  name: 's3-file-trigger',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 120,
  memoryMB: 512,
  resourceGroupName: 'data',
});
