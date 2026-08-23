import { defineFunction, secret } from '@aws-amplify/backend';

export const createCheckoutSessionFunction = defineFunction({
  name: 'create-checkout-session',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_PRICE_CORE: secret('STRIPE_PRICE_CORE'),
    STRIPE_PRICE_GROWTH: secret('STRIPE_PRICE_GROWTH'),
    STRIPE_PRICE_SCALE: secret('STRIPE_PRICE_SCALE'),
  },
});
