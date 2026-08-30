import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Stripe webhook receiver (Lambda Function URL — see backend.ts §5).
 * STRIPE_SECRET_KEY is needed because every event is resolved by
 * re-reading the subscription from Stripe with product metadata expanded.
 */
export const stripeWebhookHandlerFunction = defineFunction({
  name: 'stripe-webhook-handler',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
  },
});
