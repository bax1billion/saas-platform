// Relative, not the alias: the contract is read by Lambdas too (amplify/tsconfig.json has no `@/`).
import type { Door } from "../../shell/door";
import type { Bounds } from "../state";

/**
 * The layer-provider contract (docs/map-engine.md § 3): a product
 * publishes a bounded read and the engine draws it. The engine never
 * imports a module; the registry row carries everything it needs, and the
 * classification says what may leave the agency. A product publishes its
 * layers from `lib/services/<id>/layers.ts`, never from a component.
 */

/** What may leave the agency, enforced by the owner's read, the registry and the share and export code. */
export const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "RESTRICTED", "EMS_OPERATIONAL", "EMS_SENSITIVE", "PERSONNEL_LOCATION", "EVIDENCE"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** The classes a link or an export may ever carry; the rest never leave. */
export const SHAREABLE_CLASSIFICATIONS: readonly Classification[] = ["PUBLIC", "INTERNAL"];

/** The slice of time a read covers, so a map page never loads a whole table. */
export interface ReadWindow {
  /** ISO instant; rows older than this are not read. */
  since?: string;
  /** ISO instant; rows newer than this are not read. */
  until?: string;
}

/** What every feature a read returns must carry; the product's own fields ride along. */
export interface LayerFeatureProps {
  key: string;
  label?: string;
  [extra: string]: unknown;
}

export type LayerFeatures = GeoJSON.FeatureCollection<GeoJSON.Geometry, LayerFeatureProps>;

/** How a layer is drawn. Colours are resolved theme values (`themeColor`), never literals. */
export type LayerStyle =
  | {
      kind: "point";
      color: string;
      radius?: number;
      /** The property that holds a sprite id (`lib/map/sprites.ts`); without it a point is a dot. */
      icon?: string;
      /** The sprites' drawn size in CSS pixels at icon-size 1 (their `SpriteEntry.size`). */
      spriteSize?: number;
      /** The property that labels a point. */
      label?: string;
      /** Cluster above the threshold (the default), always, or never. */
      cluster?: "auto" | "always" | "never";
    }
  | { kind: "line"; color: string; width?: number; dash?: number[] }
  | { kind: "polygon"; color: string; fillOpacity?: number; outline?: boolean }
  | { kind: "raster"; tiles: string[]; tileSize?: number; attribution?: string; opacity?: number }
  | { kind: "heat"; weight?: string; radius?: number };

export interface MapLayer {
  /** `<owner>.<name>`, e.g. "one.points". */
  key: string;
  /** The module id that owns the rows; the registry lists the layer only where the org holds it. */
  owner: string;
  label: string;
  classification: Classification;
  /** The doors that list the layer at all. */
  doors: readonly Door[];
  /** Shown by default, per door; absent means off. */
  defaultOn?: Partial<Record<Door, boolean>>;
  /** What the licence and the owner allow: a pack may hold it, a live layer is read with signal, never means online only. */
  offline: "pack" | "live" | "never";
  style: LayerStyle;
  /** The bounded read; a raster layer has none. */
  read?: (bounds: Bounds, window: ReadWindow, signal: AbortSignal) => Promise<LayerFeatures>;
  /** False lists the layer as not built yet; it is never read. */
  live?: boolean;
}

export const EMPTY_FEATURES: LayerFeatures = { type: "FeatureCollection", features: [] };
