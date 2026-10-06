/**
 * Compose per-module stream-consumer maps (table → handler keys) into the
 * one map `amplify/backend.ts` wires EventSourceMappings from.
 *
 * Object spread is the wrong tool for this: `{ ...a, ...b }` keeps only
 * the LAST module's array for a table both modules listen on, so the
 * earlier module's handler silently stops being attached. Every table is
 * a legitimate thing for more than one module to consume (one module's
 * events are how another module reacts to them), so the merge is per
 * table: handler keys are concatenated, duplicates dropped, first-seen
 * order kept.
 */
export function mergeStreamConsumers<K extends string>(
  ...maps: ReadonlyArray<Readonly<Record<string, ReadonlyArray<K>>>>
): Record<string, K[]> {
  const out: Record<string, K[]> = {};
  for (const map of maps) {
    for (const [table, keys] of Object.entries(map)) {
      const merged = out[table] ?? (out[table] = []);
      for (const key of keys) {
        if (!merged.includes(key)) merged.push(key);
      }
    }
  }
  return out;
}
