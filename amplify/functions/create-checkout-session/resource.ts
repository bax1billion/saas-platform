import { defineFunction, secret } from '@aws-amplify/backend';
import { verticalModulePriceSecrets } from '../../data/vertical';

/**
 * Tier prices are foundation secrets; add-on module prices are declared per
 * product in amplify/data/vertical.ts (verticalModulePriceSecrets) and
 * injected here under their own secret names. MODULE_PRICE_ENV tells the
 * handler which env var holds which module's price.
 */
const modulePriceSecrets = Object.fromEntries(
  Object.values(verticalModulePriceSecrets).map((name) => [name, secret(name)])
);

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
    MODULE_PRICE_ENV: JSON.stringify(verticalModulePriceSecrets),
    ...modulePriceSecrets,
  },
});
