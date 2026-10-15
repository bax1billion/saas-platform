import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from "maplibre-gl";
import { themeColor, themeColorAlpha } from "../canvas";
import type { Bounds } from "../state";
import type { BasemapProvider, StyleLabel } from "./types";

/**
 * The invented grid: streets drawn on the device from GeoJSON the product
 * supplies (a sample town, or the fallback when a hosted style will not
 * load), so the map shows no real street or place name and makes no
 * request to a tile server. It is a real file on the device, so it is the
 * one basemap that is always a pack.
 */
export interface GridData {
  features: GeoJSON.Feature[];
  labels: StyleLabel[];
  bounds: Bounds;
}

/** Street labels show from this zoom; below it the grid alone is clearer. */
export const GRID_LABEL_MIN_ZOOM = 14.5;
/** Minor streets appear from this zoom; further out the main roads alone read better. */
export const GRID_MINOR_MIN_ZOOM = 14;

export interface GridColors {
  ground: string;
  street: string;
  casing: string;
  majorCasing: string;
  arterial: string;
  arterialCasing: string;
  water: string;
  park: string;
}

/** The theme's colours for the grid; MapLibre cannot read CSS variables. */
export function gridColors(): GridColors {
  return {
    ground: themeColor("--muted", "whitesmoke"),
    street: themeColor("--card", "white"),
    casing: themeColorAlpha("--foreground", 0.16, "rgba(0,0,0,0.16)"),
    majorCasing: themeColorAlpha("--foreground", 0.28, "rgba(0,0,0,0.28)"),
    arterial: themeColorAlpha("--primary", 0.55, "rgba(90,90,90,0.55)"),
    arterialCasing: themeColorAlpha("--primary", 0.9, "rgba(60,60,60,0.9)"),
    water: themeColorAlpha("--info", 0.55, "rgba(46,109,164,0.55)"),
    park: themeColorAlpha("--success", 0.14, "rgba(44,99,68,0.14)"),
  };
}

/** A line width that grows with zoom, so roads keep their weight close in and thin out far away. */
const width = (atZoom15: number): ExpressionSpecification => ["interpolate", ["exponential", 1.6], ["zoom"], 12, atZoom15 * 0.25, 15, atZoom15, 18, atZoom15 * 2.2];

export const GRID_SOURCE = "grid";

/** The town's style, pure: the features go in through the source. */
export function gridStyle(data: GridData, colors: GridColors): StyleSpecification {
  const isKind = (k: string): FilterSpecification => ["==", ["get", "kind"], k];
  const isGrid: FilterSpecification = ["in", ["get", "kind"], ["literal", ["street", "avenue"]]];
  return {
    version: 8,
    sources: { [GRID_SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: data.features } } },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": colors.ground } },
      { id: "park", type: "fill", source: GRID_SOURCE, filter: isKind("park"), paint: { "fill-color": colors.park } },
      { id: "water", type: "line", source: GRID_SOURCE, filter: isKind("water"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": colors.water, "line-width": width(5) } },
      { id: "minor-casing", type: "line", source: GRID_SOURCE, minzoom: GRID_MINOR_MIN_ZOOM, filter: ["all", isGrid, ["!", ["get", "major"]]], paint: { "line-color": colors.casing, "line-width": width(6) } },
      { id: "major-casing", type: "line", source: GRID_SOURCE, filter: ["all", isGrid, ["get", "major"]], paint: { "line-color": colors.majorCasing, "line-width": width(10) } },
      { id: "arterial-casing", type: "line", source: GRID_SOURCE, filter: isKind("arterial"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": colors.arterialCasing, "line-width": width(12) } },
      { id: "minor", type: "line", source: GRID_SOURCE, minzoom: GRID_MINOR_MIN_ZOOM, filter: ["all", isGrid, ["!", ["get", "major"]]], paint: { "line-color": colors.street, "line-width": width(4) } },
      { id: "major", type: "line", source: GRID_SOURCE, filter: ["all", isGrid, ["get", "major"]], paint: { "line-color": colors.street, "line-width": width(7.5) } },
      { id: "arterial", type: "line", source: GRID_SOURCE, filter: isKind("arterial"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": colors.arterial, "line-width": width(9) } },
    ],
  };
}

export function gridProvider(data: GridData, colors: () => GridColors = gridColors): BasemapProvider {
  return {
    id: "grid",
    basemaps: ["grid"],
    offline: "pack",
    async resolve(basemap) {
      if (basemap !== "grid") throw new Error("The invented grid draws only itself.");
      return { style: gridStyle(data, colors()), source: "pack", attribution: "", maxBounds: data.bounds, labels: data.labels };
    },
  };
}
