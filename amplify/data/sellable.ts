import { parseStageOverrides } from './stage-overrides';

/**
 * Which add-on modules checkout may sell — the server-side half of the
 * preview gate.
 *
 * The client keeps a preview module off every buying surface by reading
 * its `stage` from the registry, but a client check alone would let anyone
 * with the GraphQL endpoint call `createCheckoutSession` with a module id
 * and buy it. The checkout Lambda therefore refuses any module id that is
 * not in the list this file resolves, so "preview" holds even for an org
 * Admin who goes around the UI.
 *
 * Two inputs, resolved once at synth time (`resolveSellableModules`):
 *
 * 1. `sellableModules` below — the code default. A module goes on sale for
 *    real by being listed here AND moving its registry `stage` to `beta`
 *    (config/modules.test.ts keeps the two in step) AND having a live
 *    Stripe Price id in the `STRIPE_MODULE_PRICES` secret.
 * 2. `NEXT_PUBLIC_MODULE_STAGES` — the per-environment override
 *    (lib/modules/stage-overrides.ts). Amplify Hosting exposes the branch's
 *    environment variables to the backend synth, so the same variable that
 *    flips a module to `beta` on staging also lets staging's Lambda sell
 *    it. Production sets no override, so production sells only the code
 *    default.
 *
 * No backend imports here on purpose: the registry test imports this file.
 */

/** Module ids that are on sale in every environment. Empty = everything is preview. */
export const sellableModules: string[] = [];

export function resolveSellableModules(
  raw: string | undefined = process.env.NEXT_PUBLIC_MODULE_STAGES
): string[] {
  const out = new Set(sellableModules);
  for (const [id, o] of Object.entries(parseStageOverrides(raw))) {
    if (o.stage === 'planned') out.delete(id);
    else out.add(id);
  }
  return [...out].sort();
}
