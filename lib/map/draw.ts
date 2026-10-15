import type { Map as MapLibreMap } from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
  type HexColor,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { themeHex } from "./canvas";
import { measureTag } from "./measure";

/**
 * Drawing tools from a library (docs/map-engine.md § 4.3): Terra
 * Draw on MapLibre, never hand-rolled handlers. One drawing layer serves
 * every owner; a finished shape is handed to the product as GeoJSON and
 * the engine stores nothing. Measure is a line mode that finishes on its
 * second point, with the distance as a label at the midpoint.
 */

/** The tools a product may put in a person's hand. */
export const DRAW_MODES = ["point", "linestring", "polygon", "circle", "freehand", "select", "measure"] as const;
export type DrawMode = (typeof DRAW_MODES)[number];

/** What each tool draws; the product stores the geometry as it is. */
export const DRAW_GEOMETRY: Record<DrawMode, "Point" | "LineString" | "Polygon" | null> = {
  point: "Point",
  linestring: "LineString",
  polygon: "Polygon",
  circle: "Polygon",
  freehand: "Polygon",
  measure: "LineString",
  select: null,
};

export interface DrawFeature {
  id: string;
  geometry: GeoJSON.Geometry;
  /** `mode` names the tool; a measured line also carries `feet` and `tag`. */
  properties: Record<string, unknown> & { mode: string };
}

export interface DrawHandlers {
  /** While a shape is being drawn or edited. */
  onChange?: (feature: DrawFeature) => void;
  /** A shape is complete, or an edit is done. */
  onFinish?: (feature: DrawFeature) => void;
  /** The shape in hand was dropped (Escape, or the product's cancel). */
  onCancel?: () => void;
  onSelect?: (id: string | null) => void;
}

/** The library takes six-digit hex only, so the theme's tokens are read as such. */
export interface DrawColors {
  line: HexColor;
  fill: HexColor;
  casing: HexColor;
}

export function drawColors(): DrawColors {
  return { line: themeHex("--primary", "#1f3a5f"), fill: themeHex("--primary", "#1f3a5f"), casing: themeHex("--background", "#ffffff") };
}

/** A library feature as the product sees it; the geometry passes through untouched. */
export function toDrawFeature(f: GeoJSONStoreFeatures): DrawFeature {
  const properties: DrawFeature["properties"] = { ...(f.properties as Record<string, unknown>), mode: String(f.properties.mode ?? "") };
  if (properties.mode === "measure" && f.geometry.type === "LineString") {
    const tag = measureTag(f.geometry);
    if (tag) {
      properties.feet = tag.feet;
      properties.tag = tag.text;
    }
  }
  return { id: String(f.id), geometry: f.geometry as GeoJSON.Geometry, properties };
}

const EDIT_FLAGS = { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } };

export interface DrawController {
  /** Puts a tool in hand, or none. */
  setMode(mode: DrawMode | null): void;
  /** Drops the shape in hand. */
  cancel(): void;
  /** The shapes on the drawing layer. */
  snapshot(): DrawFeature[];
  /** Puts existing shapes on the layer, to show or to edit with `select`. */
  load(features: readonly DrawFeature[]): void;
  /** Removes shapes by id. */
  remove(ids: readonly string[]): void;
  clear(): void;
  destroy(): void;
}

export function createDraw(map: MapLibreMap, opts: { colors: DrawColors; handlers: DrawHandlers; renderBelowLayerId?: string }): DrawController {
  const { colors, handlers } = opts;
  const lineStyles = { lineStringColor: colors.line, lineStringWidth: 3, closingPointColor: colors.casing, closingPointOutlineColor: colors.line, closingPointOutlineWidth: 2 };
  const areaStyles = { fillColor: colors.fill, fillOpacity: 0.2, outlineColor: colors.line, outlineWidth: 3 };
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, renderBelowLayerId: opts.renderBelowLayerId, coordinatePrecision: 7 }),
    modes: [
      new TerraDrawPointMode({ styles: { pointColor: colors.line, pointWidth: 8, pointOutlineColor: colors.casing, pointOutlineWidth: 2 } }),
      new TerraDrawLineStringMode({ styles: lineStyles }),
      new TerraDrawLineStringMode({ modeName: "measure", styles: lineStyles, finishOnNthCoordinate: 2 }),
      new TerraDrawPolygonMode({ styles: areaStyles }),
      new TerraDrawCircleMode({ styles: areaStyles }),
      new TerraDrawFreehandMode({ styles: areaStyles, autoClose: true }),
      new TerraDrawSelectMode({
        flags: {
          point: { feature: { draggable: true } },
          linestring: EDIT_FLAGS,
          measure: { feature: { draggable: true, coordinates: { draggable: true } } },
          polygon: EDIT_FLAGS,
          freehand: EDIT_FLAGS,
          // A circle keeps its centre and its shape; dragging a point on it changes the radius.
          circle: { feature: { draggable: true, coordinates: { resizable: "center-fixed" } } },
        },
        styles: { selectedPolygonColor: colors.fill, selectedPolygonFillOpacity: 0.3, selectedPolygonOutlineColor: colors.line, selectedPolygonOutlineWidth: 3, selectedLineStringColor: colors.line, selectedLineStringWidth: 4, selectedPointColor: colors.line, selectedPointWidth: 10 },
      }),
    ],
  });

  let current: DrawMode | null = null;
  const feature = (id: string | number) => {
    const f = draw.getSnapshotFeature(id);
    return f ? toDrawFeature(f) : null;
  };
  draw.on("change", (ids, type) => {
    for (const id of ids) {
      const f = feature(id);
      if (f) handlers.onChange?.(f);
      // The shape in hand went away without finishing: Escape, or the library's own cleanup.
      else if (type === "delete" && current && current !== "select") handlers.onCancel?.();
    }
  });
  draw.on("finish", (id) => {
    const f = feature(id);
    if (f) handlers.onFinish?.(f);
  });
  draw.on("select", (id) => handlers.onSelect?.(String(id)));
  draw.on("deselect", () => handlers.onSelect?.(null));
  draw.start();
  draw.setMode("static");

  return {
    setMode(mode) {
      if (mode === current) return;
      current = mode;
      draw.setMode(mode ?? "static");
    },
    cancel() {
      if (!current) return;
      // Leaving the tool drops the shape in hand; the library cleans it up.
      current = null;
      draw.setMode("static");
      handlers.onCancel?.();
    },
    snapshot: () => draw.getSnapshot().map(toDrawFeature),
    load(features) {
      draw.addFeatures(
        features.map((f) => ({ id: f.id, type: "Feature", geometry: f.geometry as GeoJSONStoreFeatures["geometry"], properties: f.properties as GeoJSONStoreFeatures["properties"] }))
      );
    },
    remove(ids) {
      draw.removeFeatures(ids.filter((id) => draw.hasFeature(id)));
    },
    clear: () => draw.clear(),
    destroy() {
      current = null;
      draw.stop();
    },
  };
}
