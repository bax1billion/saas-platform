import type { BasemapProvider } from "./types";

/**
 * Our own street basemap as a PMTiles file, online from the CDN and
 * offline from a district pack (docs/map-engine.md § 2, § 5).
 * Phase 2 of the plan: until then it offers no basemap, so the engine
 * never lists one it cannot draw.
 */
export function pmtilesProvider(): BasemapProvider {
  return {
    id: "pmtiles",
    basemaps: [],
    offline: "pack",
    async resolve() {
      throw new Error("Street packs are not built yet.");
    },
  };
}
