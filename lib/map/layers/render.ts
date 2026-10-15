import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Door } from "@/lib/shell/door";
import { DESK_TEXT_PX, FIELD_TARGET_PX, FIELD_TEXT_PX, ICON_MIN_PX } from "../floors";
import type { Bounds } from "../state";
import { EMPTY_FEATURES, type LayerFeatures, type MapLayer, type ReadWindow } from "./contract";

/**
 * Drawing registry layers (docs/map-engine.md § 4.2): one source
 * per layer, inserted under the basemap's first label layer so a feature
 * is never hidden under a street name, in the order raster, polygon,
 * line, heat, point. Points with an icon property are symbol layers with
 * sprites from the catalog (../sprites.ts), labels with collision, and
 * clusters above a few hundred features; sizes never go under the Field
 * floor. The pure parts (order, ids, specs, sizes, the read scheduler) are
 * tested; the MapLibre calls are the thin part at the end.
 */

const KIND_RANK = { raster: 0, polygon: 1, line: 2, heat: 3, point: 4 } as const;

/** Layers in drawing order, stable within a kind. */
export function layerOrder<T extends { style: { kind: keyof typeof KIND_RANK } }>(layers: readonly T[]): T[] {
  return layers
    .map((layer, i) => ({ layer, i }))
    .sort((a, b) => KIND_RANK[a.layer.style.kind] - KIND_RANK[b.layer.style.kind] || a.i - b.i)
    .map(({ layer }) => layer);
}

/** The basemap's first label layer: our layers go under it. */
export function firstSymbolLayerId(style: Pick<StyleSpecification, "layers"> | undefined): string | undefined {
  return style?.layers.find((l) => l.type === "symbol")?.id;
}

export const sourceId = (key: string) => `layer:${key}`;

/** Above this many features a point layer clusters (unless it says never). */
export const CLUSTER_THRESHOLD = 300;
export const CLUSTER_RADIUS_PX = 40;
export const CLUSTER_MAX_ZOOM = 15;
/** Below this zoom icons may overlap; above it the renderer hides the loser, never the label alone. */
export const OVERLAP_ZOOM = 13;
/** Half the Field target: a tap within this of a point hits it. */
export const HIT_PAD_PX = FIELD_TARGET_PX / 2;

/** Whether this point layer clusters with this much data. */
export function shouldCluster(layer: MapLayer, featureCount: number): boolean {
  if (layer.style.kind !== "point") return false;
  const mode = layer.style.cluster ?? "auto";
  if (mode === "never") return false;
  if (mode === "always") return true;
  return featureCount > CLUSTER_THRESHOLD;
}

/**
 * `icon-size` is a multiple of the sprite's drawn size: grows with zoom
 * and never lets the symbol fall under the icon floor.
 */
export function iconSizeExpression(spriteSize: number): ExpressionSpecification {
  const floor = ICON_MIN_PX / spriteSize;
  return ["interpolate", ["linear"], ["zoom"], 10, Math.max(floor, 0.75), 16, Math.max(floor, 1), 19, Math.max(floor, 1.5)];
}

/** `text-size` in pixels: the Field floor on the Field and Station doors, smaller on the desk's Admin door. */
export function labelTextSize(door: Door): ExpressionSpecification {
  const floor = door === "admin" ? DESK_TEXT_PX : FIELD_TEXT_PX;
  return ["interpolate", ["linear"], ["zoom"], 12, floor, 18, floor + 5];
}

/** A basemap label's own text size, never under the floor. */
export function flooredTextSize(original: unknown, floor: number): ExpressionSpecification {
  if (original === undefined || original === null) return ["max", floor, 14];
  return ["max", floor, original as ExpressionSpecification];
}

/** The smallest number an interpolate or step expression over zoom can give, for tests. */
export function minimumOf(expr: ExpressionSpecification): number {
  const [op] = expr;
  if (op === "max") return Math.max(...(expr.slice(1) as unknown[]).map((v) => (typeof v === "number" ? v : minimumOf(v as ExpressionSpecification))));
  if (op === "interpolate") return Math.min(...(expr as unknown[]).slice(3).filter((_, i) => i % 2 === 1).map(Number));
  if (op === "step") return Math.min(...(expr as unknown[]).slice(2).filter((_, i) => i % 2 === 0).map(Number));
  throw new Error(`minimumOf: ${op}`);
}

/** The MapLibre layer ids a registry layer draws with, in drawing order. */
export function layerIds(layer: MapLayer): string[] {
  const base = `layer:${layer.key}`;
  switch (layer.style.kind) {
    case "raster":
      return [`${base}:raster`];
    case "polygon":
      return layer.style.outline === false ? [`${base}:fill`] : [`${base}:fill`, `${base}:outline`];
    case "line":
      return [`${base}:line`];
    case "heat":
      return [`${base}:heat`];
    case "point":
      return [`${base}:cluster`, `${base}:cluster-count`, `${base}:halo`, `${base}:point`];
  }
}

export interface SpecOptions {
  /** The page background, as a resolved colour, for strokes and halos. */
  background: string;
  /** The text colour, as a resolved colour. */
  foreground: string;
  door: Door;
}

const notCluster: ExpressionSpecification = ["!", ["has", "point_count"]];
const isCluster: ExpressionSpecification = ["has", "point_count"];

/** The layer specs for a registry layer, in drawing order. */
export function layerSpecs(layer: MapLayer, opts: SpecOptions): LayerSpecification[] {
  const source = sourceId(layer.key);
  const ids = layerIds(layer);
  const s = layer.style;
  switch (s.kind) {
    case "raster":
      return [{ id: ids[0], type: "raster", source, paint: { "raster-opacity": s.opacity ?? 1 } }];
    case "polygon": {
      const specs: LayerSpecification[] = [{ id: ids[0], type: "fill", source, paint: { "fill-color": s.color, "fill-opacity": s.fillOpacity ?? 0.2 } }];
      if (ids[1]) specs.push({ id: ids[1], type: "line", source, paint: { "line-color": s.color, "line-width": 2 } });
      return specs;
    }
    case "line":
      return [
        {
          id: ids[0],
          type: "line",
          source,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": s.color, "line-width": s.width ?? 3, ...(s.dash ? { "line-dasharray": s.dash } : {}) },
        },
      ];
    case "heat":
      return [
        {
          id: ids[0],
          type: "heatmap",
          source,
          paint: {
            "heatmap-weight": s.weight ? ["coalesce", ["get", s.weight], 1] : 1,
            "heatmap-radius": s.radius ?? 24,
            "heatmap-opacity": 0.7,
          },
        },
      ];
    case "point": {
      const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
      const [clusterId, countId, haloId, pointId] = ids;
      const radius = s.radius ?? 7;
      const textSize = labelTextSize(opts.door);
      const specs: LayerSpecification[] = [
        {
          id: clusterId,
          type: "circle",
          source,
          filter: isCluster,
          paint: {
            "circle-color": s.color,
            "circle-radius": ["step", ["get", "point_count"], HIT_PAD_PX, 50, HIT_PAD_PX + 6, 500, HIT_PAD_PX + 12],
            "circle-stroke-color": opts.background,
            "circle-stroke-width": 2,
          },
        },
        {
          id: countId,
          type: "symbol",
          source,
          filter: isCluster,
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": textSize, "text-allow-overlap": true },
          paint: { "text-color": opts.background },
        },
        {
          id: haloId,
          type: "circle",
          source,
          filter: notCluster,
          paint: { "circle-radius": Math.max(radius * 2, HIT_PAD_PX / 2), "circle-color": s.color, "circle-opacity": ["case", selected, 0.3, 0] },
        },
      ];
      if (s.icon) {
        specs.push({
          id: pointId,
          type: "symbol",
          source,
          filter: notCluster,
          layout: {
            "icon-image": ["get", s.icon],
            "icon-size": iconSizeExpression(s.spriteSize ?? 32),
            "icon-allow-overlap": ["step", ["zoom"], true, OVERLAP_ZOOM, false],
            "icon-ignore-placement": false,
            ...(s.label
              ? {
                  "text-field": ["coalesce", ["get", s.label], ""],
                  "text-size": textSize,
                  "text-anchor": "top",
                  "text-offset": [0, 1],
                  "text-optional": true,
                }
              : {}),
          },
          paint: { "text-color": opts.foreground, "text-halo-color": opts.background, "text-halo-width": 1.5 },
        });
      } else {
        specs.push({
          id: pointId,
          type: "circle",
          source,
          filter: notCluster,
          paint: { "circle-radius": radius, "circle-color": s.color, "circle-stroke-color": opts.background, "circle-stroke-width": 2 },
        });
      }
      return specs;
    }
  }
}

/**
 * Reads, bounded by the view and the window, one in flight per layer: a
 * new view aborts the read still running for that layer. The delay is the
 * caller's (350 ms after `moveend`); this only owns the controllers.
 */
export interface ReadScheduler {
  /** Starts a read per layer, aborting the one in flight for the same key. */
  run(layers: readonly MapLayer[], bounds: Bounds, window: ReadWindow, onResult: (key: string, data: LayerFeatures) => void, onProblem: (key: string, message: string) => void): void;
  /** Aborts every read in flight. */
  stop(): void;
  /** The controller in flight for a key, for tests. */
  inFlight(key: string): AbortController | undefined;
}

export function createReadScheduler(): ReadScheduler {
  const controllers = new Map<string, AbortController>();
  return {
    run(layers, bounds, window, onResult, onProblem) {
      for (const layer of layers) {
        if (!layer.read) continue;
        controllers.get(layer.key)?.abort();
        const controller = new AbortController();
        controllers.set(layer.key, controller);
        layer
          .read(bounds, window, controller.signal)
          .then((data) => {
            if (controller.signal.aborted) return;
            onResult(layer.key, data);
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            onProblem(layer.key, err instanceof Error ? err.message : "This layer did not load.");
          })
          .finally(() => {
            if (controllers.get(layer.key) === controller) controllers.delete(layer.key);
          });
      }
    },
    stop() {
      for (const c of controllers.values()) c.abort();
      controllers.clear();
    },
    inFlight: (key) => controllers.get(key),
  };
}

/** What a layer draws from right now. */
export interface DrawnLayer {
  layer: MapLayer;
  data: LayerFeatures;
}

/** Whether each source was added clustered, so a change rebuilds it. */
const clustered = new WeakMap<MapLibreMap, Map<string, boolean>>();

function removeLayerSet(map: MapLibreMap, layer: MapLayer) {
  for (const id of layerIds(layer)) if (map.getLayer(id)) map.removeLayer(id);
  const id = sourceId(layer.key);
  if (map.getSource(id)) map.removeSource(id);
}

/**
 * Puts the layers on the map in drawing order under `beforeId`, adds or
 * updates each source, and removes what is no longer listed. Safe to call
 * after every style load and every data change.
 */
export function syncLayers(map: MapLibreMap, drawn: readonly DrawnLayer[], opts: SpecOptions & { beforeId?: string }) {
  const wanted = new Set(drawn.map((d) => d.layer.key));
  let flags = clustered.get(map);
  if (!flags) clustered.set(map, (flags = new Map()));
  // Drop what is gone: layers first, then their source.
  const style = map.getStyle();
  for (const l of style?.layers ?? []) {
    const m = /^layer:(.+):[a-z-]+$/.exec(l.id);
    if (m && !wanted.has(m[1])) map.removeLayer(l.id);
  }
  for (const id of Object.keys(style?.sources ?? {})) {
    const m = /^layer:(.+)$/.exec(id);
    if (m && !wanted.has(m[1]) && map.getSource(id)) {
      map.removeSource(id);
      flags.delete(m[1]);
    }
  }
  const ordered = layerOrder(drawn.map((d) => ({ ...d, style: d.layer.style })));
  for (const { layer, data } of ordered) {
    const id = sourceId(layer.key);
    if (layer.style.kind === "raster") {
      if (!map.getSource(id)) map.addSource(id, { type: "raster", tiles: layer.style.tiles, tileSize: layer.style.tileSize ?? 256, attribution: layer.style.attribution });
    } else {
      const features = data ?? EMPTY_FEATURES;
      const cluster = shouldCluster(layer, features.features.length);
      // Clustering is a source option: crossing the threshold rebuilds the source.
      if (map.getSource(id) && flags.get(layer.key) !== cluster) removeLayerSet(map, layer);
      const existing = map.getSource(id);
      if (existing) {
        (existing as GeoJSONSource).setData(features);
      } else {
        map.addSource(id, {
          type: "geojson",
          data: features,
          promoteId: "key",
          ...(cluster ? { cluster: true, clusterRadius: CLUSTER_RADIUS_PX, clusterMaxZoom: CLUSTER_MAX_ZOOM } : {}),
        });
        flags.set(layer.key, cluster);
      }
    }
    for (const spec of layerSpecs(layer, opts)) {
      if (map.getLayer(spec.id)) continue;
      map.addLayer(spec, opts.beforeId && map.getLayer(opts.beforeId) ? opts.beforeId : undefined);
    }
  }
  // The drawing order is the registry's, not the order the data arrived in.
  const before = opts.beforeId && map.getLayer(opts.beforeId) ? opts.beforeId : undefined;
  for (const { layer } of ordered) {
    for (const id of layerIds(layer)) if (map.getLayer(id)) map.moveLayer(id, before);
  }
}

/**
 * On the Field door the basemap's own labels get the text floor too, so a
 * street name reads from the cab. Run after every style load.
 */
export function applyBasemapTextFloor(map: MapLibreMap, door: Door) {
  if (door !== "field") return;
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== "symbol" || l.id.startsWith("layer:")) continue;
    const current = map.getLayoutProperty(l.id, "text-size") as unknown;
    if (Array.isArray(current) && current[0] === "max") continue;
    map.setLayoutProperty(l.id, "text-size", flooredTextSize(current, FIELD_TEXT_PX));
  }
}

/** The point and cluster layers' ids, for hit testing. */
export const pointLayerIds = (layers: readonly MapLayer[]) => layers.filter((l) => l.style.kind === "point").flatMap((l) => [`layer:${l.key}:point`, `layer:${l.key}:cluster`]);

/** The sources that may hold the selected feature. */
export const featureSourceIds = (layers: readonly MapLayer[]) => layers.filter((l) => l.style.kind !== "raster").map((l) => sourceId(l.key));

/** What a tap found: distinct feature keys, or a cluster to open. */
export function hitsOf(features: readonly { properties?: Record<string, unknown> | null; source?: string }[]): { keys: string[]; cluster: { source: string; id: number } | null } {
  const keys: string[] = [];
  let cluster: { source: string; id: number } | null = null;
  for (const f of features) {
    const p = f.properties ?? {};
    if (typeof p.cluster_id === "number" && f.source && !cluster) cluster = { source: f.source, id: p.cluster_id };
    else if (typeof p.key === "string" && !keys.includes(p.key)) keys.push(p.key);
  }
  return { keys, cluster };
}
