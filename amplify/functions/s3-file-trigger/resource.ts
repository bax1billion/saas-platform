import { defineFunction } from '@aws-amplify/backend';

/**
 * Ingest pipeline for uploads/ (handler.ts). Streams the whole object to
 * hash it, so the budget is sized for multi-GB evidence video: a 5 GB
 * clip at ~100 MB/s is under a minute, 15 min is the platform ceiling.
 * Memory buys network throughput on Lambda.
 */
export const s3FileTriggerFunction = defineFunction({
  name: 's3-file-trigger',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 900,
  memoryMB: 1024,
  resourceGroupName: 'data',
});
