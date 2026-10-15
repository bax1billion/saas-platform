import type { MapConfig } from "../location";
import type { BasemapId } from "../state";
import { amazonProvider } from "./amazon";
import { gridProvider, type GridData, type GridColors } from "./grid";
import { pmtilesProvider } from "./pmtiles";
import type { BasemapProvider } from "./types";

export type { BasemapProvider, MapAccess, ResolvedStyle, StyleLabel, StyleRequest } from "./types";
export { AMAZON_ATTRIBUTION, amazonProvider, amazonSigning } from "./amazon";
export { GRID_LABEL_MIN_ZOOM, GRID_MINOR_MIN_ZOOM, GRID_SOURCE, gridColors, gridProvider, gridStyle, type GridData, type GridColors } from "./grid";
export { pmtilesProvider } from "./pmtiles";

/**
 * The providers a map can draw from: the hosted styles where the map
 * services are deployed, the invented grid where the product supplies one,
 * and the street packs once they exist.
 */
export function createProviders(input: { config: MapConfig | null; grid?: GridData; gridColors?: () => GridColors }): BasemapProvider[] {
  const providers: BasemapProvider[] = [];
  if (input.config) providers.push(amazonProvider(input.config));
  providers.push(pmtilesProvider());
  if (input.grid) providers.push(gridProvider(input.grid, input.gridColors));
  return providers;
}

/** Every basemap some provider offers, in provider order. */
export function availableBasemaps(providers: readonly BasemapProvider[]): BasemapId[] {
  return providers.flatMap((p) => [...p.basemaps]);
}

export function providerFor(providers: readonly BasemapProvider[], basemap: BasemapId): BasemapProvider | null {
  return providers.find((p) => p.basemaps.includes(basemap)) ?? null;
}
