import { defineFunction, secret } from '@aws-amplify/backend';
import { resolveSellableModules } from '../../data/sellable';

/**
 * Tier prices are foundation secrets. Add-on module prices live in ONE
 * secret, STRIPE_MODULE_PRICES: a JSON object of module id to Stripe Price
 * id, e.g. {"widgets":"price_123","reports":"price_456"}. One secret rather
 * than one per module because every bound secret costs an environment
 * variable plus an SSM path entry, and a Lambda's environment is capped at
 * 4 KB: a lineup of a dozen or more modules bound one by one fails the
 * deploy with "Request must be smaller than 5120 bytes".
 *
 * The secret is bound only when this environment may sell a module
 * (sellableModules plus NEXT_PUBLIC_MODULE_STAGES, amplify/data/sellable.ts).
 * A bound secret must exist in the environment or the deploy fails, so an
 * environment that sells nothing (production until a module goes on sale,
 * every sandbox by default) needs no module price secret at all.
 * SELLABLE_MODULES is the preview gate's server half: a module id outside
 * it is refused even when a price exists.
 */
const sellable = resolveSellableModules();

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
    SELLABLE_MODULES: JSON.stringify(sellable),
    ...(sellable.length > 0 ? { STRIPE_MODULE_PRICES: secret('STRIPE_MODULE_PRICES') } : {}),
  },
});
