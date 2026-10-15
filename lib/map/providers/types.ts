import type { StyleSpecification } from "maplibre-gl";
import type { ColorScheme } from "../basemap";
import type { BasemapId, Bounds, LngLat, MapSource } from "../state";

/**
 * The provider adapter (docs/map-engine.md § 2): one interface,
 * one implementation per basemap source. A provider says which basemaps
 * it offers, what its licence allows offline, and turns a basemap id into
 * a style; signing requests is the engine's job, not the provider's.
 */

/** Who is looking: a signed-in member, or a page opened with no account. */
export type MapAccess = "signedIn" | "public";

export interface StyleRequest {
  access: MapAccess;
  colorScheme: ColorScheme;
  terrain: boolean;
}

/** A label drawn on the device over a basemap that has none of its own. */
export interface StyleLabel {
  name: string;
  at: LngLat;
  /** Degrees to rotate so it reads along its street. */
  rotate: number;
}

export interface ResolvedStyle {
  style: string | StyleSpecification;
  source: MapSource;
  /** Credit for an export's footer; the map corner credits the style's own sources. */
  attribution: string;
  /** The map cannot pan beyond these (the invented town). */
  maxBounds?: Bounds;
  labels?: StyleLabel[];
}

export interface BasemapProvider {
  id: "amazon" | "pmtiles" | "grid";
  basemaps: readonly BasemapId[];
  /** What the licence allows: `pack` may be stored on a device, `never` may not. */
  offline: "never" | "pack";
  resolve(basemap: BasemapId, req: StyleRequest): Promise<ResolvedStyle>;
}
