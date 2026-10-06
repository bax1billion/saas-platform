/**
 * White-label module registry — the product's list of modules (products
 * within the product). Each entry's code lives in modules/<id>/; see
 * docs/modules.md for the authoring pattern.
 *
 * This file is downstream-owned: the foundation ships it empty and the
 * shell, marketing sections and entitlement helpers all read from it.
 */

import type { ModuleDef } from "@/lib/modules/types";
import { applyStageOverrides } from "@/lib/modules/stage-overrides";

const registry: ModuleDef[] = [];

/**
 * The registry an environment actually runs. `NEXT_PUBLIC_MODULE_STAGES`
 * (set per branch in the Amplify console, or in .env.local) can flip a
 * preview to `beta` for that environment only, so staging can exercise
 * checkout against a test-mode Stripe Price while production keeps the
 * module in preview. See lib/modules/stage-overrides.ts.
 */
export const modules: ModuleDef[] = applyStageOverrides(
  registry,
  process.env.NEXT_PUBLIC_MODULE_STAGES
);
