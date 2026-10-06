import type { ModuleDef } from "./types";
import { parseStageOverrides, type StageOverride } from "@/amplify/data/stage-overrides";

/**
 * Per-environment module stage overrides.
 *
 * A module's `stage` lives in its registry entry and is the same in every
 * environment. That is right for production, where every module is a
 * preview until it goes on sale, but staging needs a preview module
 * flipped to `beta` so checkout can be exercised against a test-mode
 * Stripe Price. `NEXT_PUBLIC_MODULE_STAGES` does that without a code change:
 *
 *   NEXT_PUBLIC_MODULE_STAGES="widgets=beta:$149,reports=beta:$99"
 *
 * Entries are `<module id>=<stage>[:<display price>]`. The display price is
 * required when moving a preview to `beta` or `ga` (the registry never
 * advertises a price on a planned module). Set it per branch in the Amplify
 * console; Next inlines NEXT_PUBLIC_* at build time, so the staging build
 * carries staging's overrides and production carries none.
 *
 * The parser is shared with the backend (amplify/data/stage-overrides.ts):
 * the checkout Lambda reads the same variable at synth so the set it will
 * sell matches the set the UI offers (amplify/data/sellable.ts).
 */

export { parseStageOverrides, type StageOverride };

export function applyStageOverrides(mods: ModuleDef[], raw: string | undefined): ModuleDef[] {
  const overrides = parseStageOverrides(raw);
  if (Object.keys(overrides).length === 0) return mods;
  return mods.map((m) => {
    const o = overrides[m.id];
    if (!o) return m;
    const next: ModuleDef = { ...m, stage: o.stage };
    if (o.stage === "planned") delete next.price;
    else if (o.price) next.price = o.price;
    return next;
  });
}
