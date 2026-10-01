import { defineFunction } from '@aws-amplify/backend';

/**
 * Applies the signed-in user's organization sign-in policy every time
 * Cognito issues tokens (sign-in, hosted-UI sign-in, refresh): refuses a
 * sign-in method the organization turned off, and when the organization
 * requires two-step sign-in and the user has not set it up, issues tokens
 * with no groups (so every data rule denies) plus a claim that sends the
 * app to setup. IAM is granted in amplify/backend.ts (#7b). See
 * docs/sign-in-and-mfa.md.
 */
export const preTokenGeneration = defineFunction({
  name: 'pre-token-generation',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 10,
  resourceGroupName: 'auth',
  environment: {
    // Same synth-time value the user pool is built from (federation-plan.ts).
    AUTH_FEDERATED_PROVIDERS: process.env.AUTH_FEDERATED_PROVIDERS ?? '',
  },
});
