import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeWebhookHandlerFunction = defineFunction({
  name: 'stripe-webhook-handler',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
  },
});
