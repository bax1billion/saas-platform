/**
 * Parser for `NEXT_PUBLIC_MODULE_STAGES`, the per-environment module stage
 * override. Lives under amplify/ because the backend synth loads it (the
 * checkout Lambda's resource file) and files outside amplify/ resolve as
 * CommonJS there (docs/modules.md). The client reads it through
 * lib/modules/stage-overrides.ts. No imports on purpose.
 *
 *   NEXT_PUBLIC_MODULE_STAGES="widgets=beta:$149,reports=beta:$99"
 *
 * Entries are `<module id>=<stage>[:<display price>]`, comma separated.
 * Unknown stages and malformed entries are ignored so a typo can never take
 * an environment down.
 */

export type StageName = 'ga' | 'beta' | 'planned';

export interface StageOverride {
  stage: StageName;
  price?: string;
}

const STAGES: ReadonlySet<string> = new Set<StageName>(['ga', 'beta', 'planned']);

export function parseStageOverrides(raw: string | undefined): Record<string, StageOverride> {
  const out: Record<string, StageOverride> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const [idPart, rest] = entry.split('=');
    const id = idPart?.trim();
    if (!id || !rest) continue;
    const [stagePart, ...priceParts] = rest.split(':');
    const stage = stagePart.trim();
    if (!STAGES.has(stage)) continue;
    const price = priceParts.join(':').trim();
    out[id] = { stage: stage as StageName, ...(price ? { price } : {}) };
  }
  return out;
}
