import { defineFunction } from '@aws-amplify/backend';

/**
 * The Assist service (docs/spine-services-design.md § 2.3, pattern A):
 * `assistRun` runs one registered helper on one record for the caller and
 * returns a suggestion; `assistDecide` records what the person did with
 * it. Model ids, the mode and the cap come from the environment
 * (amplify/backend.ts); the Bedrock and S3 grants are added there too.
 */
export const assistRunFunction = defineFunction({
  name: 'assist-run',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 60,
  memoryMB: 1024,
  resourceGroupName: 'data',
});
