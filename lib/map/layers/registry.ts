import type { Door } from "@/lib/shell/door";
import type { MapLayer } from "./contract";

/**
 * The registry: what the catalog shows and the map may draw for one door
 * and one org. A layer whose owner module the org does not hold is listed
 * with the note and never read (docs/data-coupling.md rule 5: a cross
 * module read is enrichment, never required); a layer not built yet is
 * listed as such.
 */
export interface Entitlements {
  /** Whether the org holds the module (`useEntitlements().hasModule`). */
  has(moduleId: string): boolean;
  /** The product's name for the note. */
  label(moduleId: string): string;
}

export interface RegistryEntry {
  layer: MapLayer;
  /** The org holds the owner and the layer is built: it may be read and drawn. */
  available: boolean;
  /** Why it is not: the copy the catalog shows in place of a switch. */
  note?: string;
}

export interface LayerRegistry {
  /** Every layer, in the order given. */
  all(): readonly MapLayer[];
  /** The rows for a door: only layers listed there, each with whether it is available. */
  forDoor(door: Door, entitlements: Entitlements): RegistryEntry[];
  /** The visibility defaults for a door, for the initial map state. */
  defaults(door: Door): Record<string, boolean>;
  /** The layers to draw: available rows the state has on (or defaults on when the state is silent). */
  visible(entries: readonly RegistryEntry[], door: Door, layersState: Record<string, boolean>): MapLayer[];
}

export function createRegistry(layers: readonly MapLayer[]): LayerRegistry {
  const keys = new Set<string>();
  for (const layer of layers) {
    if (keys.has(layer.key)) throw new Error(`Map layer "${layer.key}" is registered twice.`);
    keys.add(layer.key);
  }
  const isOn = (layer: MapLayer, door: Door, state: Record<string, boolean>) => state[layer.key] ?? layer.defaultOn?.[door] ?? false;
  return {
    all: () => layers,
    forDoor(door, entitlements) {
      return layers
        .filter((layer) => layer.doors.includes(door))
        .map((layer) => {
          if (layer.live === false) return { layer, available: false, note: "Not built yet" };
          if (!entitlements.has(layer.owner)) return { layer, available: false, note: `Turn on ${entitlements.label(layer.owner)} to see this` };
          return { layer, available: true };
        });
    },
    defaults(door) {
      return Object.fromEntries(layers.filter((l) => l.doors.includes(door)).map((l) => [l.key, l.defaultOn?.[door] ?? false]));
    },
    visible(entries, door, layersState) {
      return entries.filter((e) => e.available && isOn(e.layer, door, layersState)).map((e) => e.layer);
    },
  };
}
