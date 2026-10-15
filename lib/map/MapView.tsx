"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Door } from "@/lib/shell/door";
import { cn } from "@/lib/utils";
import type { ColorScheme } from "./basemap";
import { themeColor, type Snapshot } from "./canvas";
import { createDraw, drawColors, type DrawController, type DrawFeature, type DrawMode } from "./draw";
import { FIELD_TEXT_PX } from "./floors";
import {
  applyBasemapTextFloor,
  createReadScheduler,
  EMPTY_FEATURES,
  featureSourceIds,
  firstSymbolLayerId,
  HIT_PAD_PX,
  hitsOf,
  layerIds,
  pointLayerIds,
  syncLayers,
  type DrawnLayer,
  type LayerFeatures,
  type MapLayer,
  type ReadWindow,
} from "./layers";
import type { MapConfig } from "./location";
import { amazonSigning, availableBasemaps, createProviders, GRID_LABEL_MIN_ZOOM, providerFor, type GridData, type MapAccess, type ResolvedStyle } from "./providers";
import { addSprites, devicePixelRatioFor, type SpriteEntry } from "./sprites";
import { boundsArray, type Bounds, type Camera, type LngLat, type MapAction, type MapState } from "./state";

/** The worker is served from public/ (scripts/copy-maplibre-worker.mjs), not fetched from outside. */
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

/**
 * The one map component (docs/map-engine.md § 4.1). It owns one
 * MapLibre instance for its life, renders `MapState` and nothing else
 * holds map state; props are data and callbacks only, and a product never
 * reaches into MapLibre. Styles switch in place so the camera and the
 * drawn features survive; a hosted style that will not load falls back to
 * the invented grid when the product supplies one; every control it draws
 * meets the Field floor.
 *
 * Registry layers (./layers) are read by the view's bounds and the
 * product's window, 350 ms after the map stops moving, one read in flight
 * per layer, and drawn under the basemap's first label layer. Until the
 * symbol layers land (MAP-06), points are plain dots; the `features` prop
 * is the older ad hoc collection, drawn on top.
 */

/** What a feature carries for the engine; the product's own fields ride along. */
export interface MapFeatureProps {
  key: string;
  label?: string;
  /** The registry layer the feature belongs to; a capture can leave a layer out. */
  layer?: string;
  /** A theme colour for the shape, as a resolved value (`themeColor`). */
  color?: string;
  [extra: string]: unknown;
}

export type MapFeatures = GeoJSON.FeatureCollection<GeoJSON.Geometry, MapFeatureProps>;

export interface MapViewProps {
  state: MapState;
  dispatch: Dispatch<MapAction>;
  /** `mapConfig()`; null where no map services are deployed (the grid alone). */
  config: MapConfig | null;
  access?: MapAccess;
  /** The org holds a product with a map; false draws the gate, never a style. */
  entitled?: boolean;
  entitledMessage?: string;
  door?: Door;
  /** The invented town, for the sample and as the fallback when a hosted style fails. */
  grid?: GridData;
  colorScheme?: ColorScheme;
  terrain?: boolean;
  /** Registry layers to draw (docs/map-engine.md § 3): the visible ones, from the registry. */
  layers?: readonly MapLayer[];
  /** The time window every layer read covers. */
  readWindow?: ReadWindow;
  /** The symbols the point layers draw with (./sprites.ts), from the product's catalog. */
  sprites?: readonly SpriteEntry[];
  features?: MapFeatures;
  /** Shapes already drawn, shown on the drawing layer and editable with the `select` tool. */
  drawFeatures?: readonly DrawFeature[];
  /** While a shape is being drawn or edited. */
  onDrawChange?: (feature: DrawFeature) => void;
  /** A shape is complete or an edit is done; the product saves it. */
  onDrawFinish?: (feature: DrawFeature) => void;
  /** The shape in hand was dropped. */
  onDrawCancel?: () => void;
  /** With the `select` tool in hand: a shape on the drawing layer was picked (by its id), or none. */
  onDrawSelect?: (id: string | null) => void;
  onSelect?: (key: string | null) => void;
  /** A tap that hit several features: the product opens its list, never the top one silently. */
  onSelectMany?: (keys: string[]) => void;
  /** A tap on nothing: a pin drop, a placement, a spot. */
  onEmptyTap?: (at: LngLat) => void;
  onLocate?: (at: LngLat) => void;
  onCameraChange?: (camera: Camera) => void;
  /** Something the person should see in place (`MapProblem`), never a toast. */
  onProblem?: (message: string) => void;
  /** A layer's read failed; the catalog row says "Unavailable" with retry. */
  onLayerProblem?: (key: string, message: string) => void;
  controls?: { zoom?: boolean; locate?: boolean; scale?: boolean };
  className?: string;
  /** Overlays the product draws over the map (panels, the drawing toolbar). */
  children?: ReactNode;
}

export interface CaptureOptions {
  /** Registry layers to leave out of the picture; their features count as `leftOut`. */
  hideLayers?: string[];
}

export interface MapViewHandle {
  capture(opts?: CaptureOptions): Promise<Snapshot>;
  /** The view on screen, for a bounded read. */
  bounds(): Bounds | null;
  /** Reads every layer again for the current view. */
  refresh(): void;
  /** Drops the shape in hand. */
  cancelDraw(): void;
  /** Removes shapes from the drawing layer by id (after the product saved or discarded them). */
  removeDrawn(ids: readonly string[]): void;
  /** The basemap's credits, as the map shows them, for a printed copy. */
  credits(): string;
}

const DRAW_TAGS = "draw-tags";
const DRAW_TAGS_LAYER = "draw-tags-label";
const NO_DRAWN: readonly DrawFeature[] = [];

/** The measured lines' readouts as a symbol layer at each midpoint. */
function tagFeatures(features: readonly DrawFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => typeof f.properties.tag === "string" && f.geometry.type === "LineString")
      .map((f) => {
        const c = (f.geometry as GeoJSON.LineString).coordinates;
        const a = c[0];
        const b = c[c.length - 1];
        return { type: "Feature", properties: { tag: f.properties.tag }, geometry: { type: "Point", coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] } };
      }),
  };
}

const SOURCE = "features";
const LAYERS = { fill: "features-fill", line: "features-line", point: "features-point", halo: "features-halo" } as const;
/** The pause after the map stops moving before the layers are read again. */
const READ_DELAY_MS = 350;

const NO_LAYERS: readonly MapLayer[] = [];
const NO_SPRITES: readonly SpriteEntry[] = [];
const NO_WINDOW: ReadWindow = {};
const EMPTY: MapFeatures = { type: "FeatureCollection", features: [] };

function cameraOf(map: maplibregl.Map): Camera {
  const c = map.getCenter();
  return { center: { lng: c.lng, lat: c.lat }, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

function boundsOf(map: maplibregl.Map): Bounds {
  const b = map.getBounds();
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

/** Adds the ad hoc feature source and layers to whatever style is current, on top of everything. */
function addFeatureLayers(map: maplibregl.Map, data: MapFeatures, accent: string) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, { type: "geojson", data, promoteId: "key" });
  const color: maplibregl.ExpressionSpecification = ["coalesce", ["get", "color"], accent];
  map.addLayer({ id: LAYERS.fill, type: "fill", source: SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.2 } });
  map.addLayer({ id: LAYERS.line, type: "line", source: SOURCE, filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 3 } });
  map.addLayer({
    id: LAYERS.halo,
    type: "circle",
    source: SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 14, "circle-color": color, "circle-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.3, 0] },
  });
  map.addLayer({
    id: LAYERS.point,
    type: "circle",
    source: SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 7, "circle-color": color, "circle-stroke-color": themeColor("--background", "white"), "circle-stroke-width": 2 },
  });
}

function pointOf(f: GeoJSON.Feature | undefined): LngLat | null {
  if (!f || f.geometry.type !== "Point") return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lng, lat };
}

/** The feature with `key` in the ad hoc collection or any layer's data. */
function findFeature(key: string | null, features: MapFeatures, layerData: Record<string, LayerFeatures>): GeoJSON.Feature<GeoJSON.Geometry, { key: string; label?: string }> | undefined {
  if (!key) return undefined;
  const own = features.features.find((f) => f.properties.key === key);
  if (own) return own;
  for (const data of Object.values(layerData)) {
    const hit = data.features.find((f) => f.properties.key === key);
    if (hit) return hit;
  }
  return undefined;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    state,
    dispatch,
    config,
    access = "signedIn",
    entitled = true,
    entitledMessage = "This map needs a product that includes maps.",
    door = "station",
    grid,
    colorScheme = "Light",
    terrain = false,
    layers = NO_LAYERS,
    readWindow = NO_WINDOW,
    sprites = NO_SPRITES,
    features = EMPTY,
    drawFeatures = NO_DRAWN,
    onDrawChange,
    onDrawFinish,
    onDrawCancel,
    onDrawSelect,
    onSelect,
    onSelectMany,
    onEmptyTap,
    onLocate,
    onCameraChange,
    onProblem,
    onLayerProblem,
    controls,
    className,
    children,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState("");
  const [layerData, setLayerData] = useState<Record<string, LayerFeatures>>({});
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const ringRef = useRef<maplibregl.Marker | null>(null);
  const shownBasemapRef = useRef<MapState["basemap"] | null>(null);
  const schedulerRef = useRef(createReadScheduler());
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawnRef = useRef<DrawnLayer[]>([]);
  const featuresRef = useRef(features);
  featuresRef.current = features;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const windowRef = useRef(readWindow);
  windowRef.current = readWindow;
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;
  const doorRef = useRef(door);
  doorRef.current = door;
  const stateRef = useRef(state);
  stateRef.current = state;
  // Callbacks by ref, so the map is built once and never re-bound.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectManyRef = useRef(onSelectMany);
  onSelectManyRef.current = onSelectMany;
  const onDrawChangeRef = useRef(onDrawChange);
  onDrawChangeRef.current = onDrawChange;
  const onDrawFinishRef = useRef(onDrawFinish);
  onDrawFinishRef.current = onDrawFinish;
  const onDrawCancelRef = useRef(onDrawCancel);
  onDrawCancelRef.current = onDrawCancel;
  const onDrawSelectRef = useRef(onDrawSelect);
  onDrawSelectRef.current = onDrawSelect;
  const attributionRef = useRef("");
  const drawRef = useRef<DrawController | null>(null);
  const [drawnTags, setDrawnTags] = useState<DrawFeature[]>([]);
  const onEmptyTapRef = useRef(onEmptyTap);
  onEmptyTapRef.current = onEmptyTap;
  const onLocateRef = useRef(onLocate);
  onLocateRef.current = onLocate;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const onProblemRef = useRef(onProblem);
  onProblemRef.current = onProblem;
  const onLayerProblemRef = useRef(onLayerProblem);
  onLayerProblemRef.current = onLayerProblem;

  const providers = useMemo(() => createProviders({ config, grid }), [config, grid]);
  const basemaps = useMemo(() => availableBasemaps(providers), [providers]);
  const accent = useMemo(() => themeColor("--primary", "#333333"), []);
  const background = useMemo(() => themeColor("--background", "white"), []);
  const foreground = useMemo(() => themeColor("--foreground", "#111111"), []);

  const resolve = useCallback(
    (basemap: MapState["basemap"]): Promise<ResolvedStyle> => {
      const provider = providerFor(providers, basemap);
      if (!provider) return Promise.reject(new Error(basemap === "grid" ? "No sample map here." : "No street map is deployed in this environment."));
      return provider.resolve(basemap, { access, colorScheme, terrain });
    },
    [providers, access, colorScheme, terrain]
  );

  /** Reads every layer for the view on screen; a read still running for a layer is abandoned. */
  const readLayers = useCallback((map: maplibregl.Map) => {
    schedulerRef.current.run(
      layersRef.current,
      boundsOf(map),
      windowRef.current,
      (key, data) => setLayerData((prev) => ({ ...prev, [key]: data })),
      (key, message) => onLayerProblemRef.current?.(key, message)
    );
  }, []);

  /** Puts the registry layers on the current style, under its first label layer. */
  const drawLayers = useCallback(
    (map: maplibregl.Map) => {
      if (!map.isStyleLoaded()) return;
      syncLayers(map, drawnRef.current, { beforeId: firstSymbolLayerId(map.getStyle()), background, foreground, door: doorRef.current });
    },
    [background, foreground]
  );

  /**
   * The drawing tools on the current style. The library draws its own
   * layers when it starts, so a style switch rebuilds it with the shapes it
   * had; the shape in hand is dropped, as it is on Escape.
   */
  const buildDraw = useCallback(
    (map: maplibregl.Map) => {
      const previous = drawRef.current?.snapshot() ?? [];
      drawRef.current?.destroy();
      const controller = createDraw(map, {
        colors: drawColors(),
        handlers: {
          onChange: (f) => onDrawChangeRef.current?.(f),
          onFinish: (f) => {
            dispatch({ type: "draw", draw: { mode: f.properties.mode, featureId: f.id, geometry: f.geometry } });
            if (f.properties.mode === "measure") setDrawnTags((prev) => [...prev.filter((p) => p.id !== f.id), f]);
            onDrawFinishRef.current?.(f);
          },
          onCancel: () => {
            dispatch({ type: "draw", draw: null });
            onDrawCancelRef.current?.();
          },
          onSelect: (id) => onDrawSelectRef.current?.(id),
        },
      });
      if (previous.length) controller.load(previous);
      drawRef.current = controller;
      // The readouts of measured lines, over everything.
      if (!map.getSource(DRAW_TAGS)) {
        map.addSource(DRAW_TAGS, { type: "geojson", data: tagFeatures(drawnTags) });
        map.addLayer({
          id: DRAW_TAGS_LAYER,
          type: "symbol",
          source: DRAW_TAGS,
          layout: { "text-field": ["get", "tag"], "text-size": FIELD_TEXT_PX, "text-anchor": "bottom", "text-offset": [0, -0.6], "text-allow-overlap": true },
          paint: { "text-color": foreground, "text-halo-color": background, "text-halo-width": 2 },
        });
      }
    },
    // The tags are read when the layer is made; later changes go through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, background, foreground]
  );

  /** The catalog's symbols as map images, drawn at the screen's density; lost with every style, so added again after each. */
  const loadSprites = useCallback((map: maplibregl.Map) => {
    const ratio = devicePixelRatioFor(typeof window === "undefined" ? undefined : window);
    return addSprites(map, spritesRef.current, ratio, (id, message) => onProblemRef.current?.(`The symbol ${id} did not draw: ${message}`));
  }, []);

  /** The style's own labels (the grid's street names), as elements over the map. */
  const applyLabels = useCallback((map: maplibregl.Map, resolved: ResolvedStyle) => {
    labelMarkersRef.current.forEach((m) => m.remove());
    labelMarkersRef.current = (resolved.labels ?? []).map((l) => {
      const el = document.createElement("div");
      el.className = "pointer-events-none";
      const text = document.createElement("span");
      text.className = "block whitespace-nowrap text-xs font-medium text-muted-foreground";
      text.style.transform = `rotate(${l.rotate}deg)`;
      // A halo in the ground colour keeps the name readable over a road.
      text.style.textShadow = "0 0 3px var(--muted), 0 0 3px var(--muted), 0 0 2px var(--muted)";
      text.textContent = l.name;
      el.appendChild(text);
      return new maplibregl.Marker({ element: el }).setLngLat([l.at.lng, l.at.lat]).addTo(map);
    });
    const show = () => {
      const on = map.getZoom() >= GRID_LABEL_MIN_ZOOM;
      for (const m of labelMarkersRef.current) m.getElement().style.visibility = on ? "visible" : "hidden";
    };
    show();
    map.on("zoom", show);
    if (resolved.maxBounds) map.setMaxBounds(boundsArray(resolved.maxBounds));
    else map.setMaxBounds(null);
  }, []);

  // One map for the component's life; rebuilt only when the services or the viewer change.
  useEffect(() => {
    if (!entitled || !containerRef.current) return;
    let cancelled = false;
    let map: maplibregl.Map | undefined;
    const scheduler = schedulerRef.current;
    (async () => {
      let basemap = stateRef.current.basemap;
      if (!basemaps.includes(basemap)) {
        if (!basemaps.length) {
          setError("No map is available here.");
          return;
        }
        basemap = basemaps[0];
        dispatch({ type: "basemap", basemap });
      }
      let signing: Partial<maplibregl.MapOptions> = {};
      if (config) {
        try {
          signing = await amazonSigning(config, access);
        } catch (err) {
          // Not signed in (or the session is stale): the hosted styles are out; the grid still draws.
          if (basemap !== "grid") {
            const message = err instanceof Error ? err.message : "Sign in to use the map.";
            if (basemaps.includes("grid")) {
              onProblemRef.current?.(message);
              basemap = "grid";
              dispatch({ type: "basemap", basemap });
            } else {
              setError(message);
              return;
            }
          }
        }
      }
      let resolved: ResolvedStyle;
      try {
        resolved = await resolve(basemap);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The map did not load.");
        return;
      }
      if (cancelled || !containerRef.current) return;
      const camera = stateRef.current.camera;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style: resolved.style,
          center: [camera.center.lng, camera.center.lat],
          zoom: camera.zoom,
          bearing: camera.bearing,
          pitch: camera.pitch,
          // The hosted style's data providers are credited; the invented grid has none.
          attributionControl: resolved.attribution ? { compact: true } : false,
          ...signing,
        });
      } catch (err) {
        console.error(err);
        setError("This device could not start the map.");
        return;
      }
      const m = map;
      shownBasemapRef.current = basemap;
      attributionRef.current = resolved.attribution;
      setAttribution(resolved.attribution);
      dispatch({ type: "source", source: resolved.source });
      if (controls?.scale !== false) m.addControl(new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 120 }), "bottom-right");

      m.on("moveend", () => {
        const c = cameraOf(m);
        dispatch({ type: "camera", camera: c });
        onCameraChangeRef.current?.(c);
        if (readTimerRef.current) clearTimeout(readTimerRef.current);
        readTimerRef.current = setTimeout(() => readLayers(m), READ_DELAY_MS);
      });
      m.on("click", (e) => {
        const target = e.originalEvent.target;
        if (target instanceof Element && target.closest(".maplibregl-marker")) return;
        const at = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        // While a tool draws or measures, every tap is the tool's.
        if (stateRef.current.mode === "draw" || stateRef.current.mode === "measure") return;
        if (stateRef.current.mode === "view") {
          const { x, y } = e.point;
          const hitLayers = [LAYERS.point, LAYERS.line, LAYERS.fill, ...pointLayerIds(layersRef.current)].filter((id) => m.getLayer(id));
          const found = hitLayers.length ? m.queryRenderedFeatures([[x - HIT_PAD_PX, y - HIT_PAD_PX], [x + HIT_PAD_PX, y + HIT_PAD_PX]], { layers: hitLayers }) : [];
          const { keys, cluster } = hitsOf(found);
          if (keys.length > 1 && onSelectManyRef.current) {
            // Several features under one finger: the product opens its list, never the top one silently.
            onSelectManyRef.current(keys);
            return;
          }
          if (keys.length) {
            dispatch({ type: "select", key: keys[0] });
            onSelectRef.current?.(keys[0]);
            return;
          }
          if (cluster) {
            // A cluster opens to the zoom where it splits.
            const src = m.getSource(cluster.source) as maplibregl.GeoJSONSource | undefined;
            src
              ?.getClusterExpansionZoom(cluster.id)
              .then((zoom) => m.easeTo({ center: e.lngLat, zoom }))
              .catch(() => m.easeTo({ center: e.lngLat, zoom: m.getZoom() + 2 }));
            return;
          }
        }
        onEmptyTapRef.current?.(at);
      });
      let loaded = false;
      // MapLibre reports a style that will not load here, not by throwing.
      m.on("error", (ev) => {
        console.error("Map error:", ev.error);
        if (loaded || cancelled || shownBasemapRef.current === "grid") return;
        if (basemaps.includes("grid")) {
          onProblemRef.current?.("The street map did not load; showing the sample grid.");
          dispatch({ type: "basemap", basemap: "grid" });
        } else {
          setError("The map did not load.");
        }
      });
      // After every style (first load and each switch) our images and layers go back on.
      m.on("style.load", () => {
        void loadSprites(m);
        applyBasemapTextFloor(m, doorRef.current);
        drawLayers(m);
        addFeatureLayers(m, featuresRef.current, accent);
        buildDraw(m);
        const key = stateRef.current.selection;
        if (key) for (const src of [SOURCE, ...featureSourceIds(layersRef.current)]) if (m.getSource(src)) m.setFeatureState({ source: src, id: key }, { selected: true });
      });
      m.on("load", () => {
        if (cancelled) return;
        loaded = true;
        applyLabels(m, resolved);
        mapRef.current = m;
        setReady(true);
        readLayers(m);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current = null;
      shownBasemapRef.current = null;
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      scheduler.stop();
      drawRef.current?.destroy();
      drawRef.current = null;
      labelMarkersRef.current.forEach((mk) => mk.remove());
      labelMarkersRef.current = [];
      ringRef.current?.remove();
      ringRef.current = null;
      setReady(false);
      map?.remove();
    };
    // The map is built once per services, viewer and entitlement; everything else updates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, access, entitled, basemaps]);

  // A basemap switch in place: the camera and the features stay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || shownBasemapRef.current === state.basemap) return;
    if (!basemaps.includes(state.basemap)) return;
    const target = state.basemap;
    shownBasemapRef.current = target;
    let stale = false;
    resolve(target)
      .then((resolved) => {
        if (stale || mapRef.current !== map) return;
        map.setStyle(resolved.style);
        applyLabels(map, resolved);
        attributionRef.current = resolved.attribution;
        setAttribution(resolved.attribution);
        dispatch({ type: "source", source: resolved.source });
      })
      .catch((err) => {
        if (stale) return;
        onProblemRef.current?.(err instanceof Error ? err.message : "The map did not switch.");
      });
    return () => {
      stale = true;
    };
  }, [state.basemap, ready, basemaps, resolve, applyLabels, dispatch]);

  // The registry layers and their data, drawn in place; a new layer is read for the current view.
  const layerKeys = layers.map((l) => l.key).join("\n");
  useEffect(() => {
    drawnRef.current = layers.map((layer) => ({ layer, data: layerData[layer.key] ?? EMPTY_FEATURES }));
    const map = mapRef.current;
    if (map && ready) drawLayers(map);
  }, [layers, layerData, ready, drawLayers]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) readLayers(map);
    // Reads again when the set of layers or the window changes, not on every data arrival.
  }, [layerKeys, readWindow, ready, readLayers]);

  // A new or edited symbol is a new image; nothing is uploaded or deployed.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && map.isStyleLoaded()) void loadSprites(map);
  }, [sprites, ready, loadSprites]);

  // Ad hoc features change in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(features);
    else if (map.isStyleLoaded()) addFeatureLayers(map, features, accent);
  }, [features, ready, accent]);

  // The selected feature: a halo in the canvas and one ring element over it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const key = state.selection;
    for (const src of [SOURCE, ...featureSourceIds(layers)]) {
      if (!map.getSource(src)) continue;
      map.removeFeatureState({ source: src });
      if (key) map.setFeatureState({ source: src, id: key }, { selected: true });
    }
    ringRef.current?.remove();
    ringRef.current = null;
    const at = pointOf(findFeature(key, features, layerData));
    if (at) {
      const el = document.createElement("div");
      el.className = "pointer-events-none h-10 w-10 rounded-full border-4 border-primary/70";
      ringRef.current = new maplibregl.Marker({ element: el }).setLngLat([at.lng, at.lat]).addTo(map);
    }
  }, [state.selection, features, layers, layerData, ready]);

  // One-shot camera requests.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.fit) return;
    map.fitBounds(boundsArray(state.fit.bounds), { duration: 600, padding: 40 });
    dispatch({ type: "handled", what: "fit" });
  }, [state.fit, ready, dispatch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.fly) return;
    map.flyTo({ center: [state.fly.center.lng, state.fly.center.lat], zoom: state.fly.zoom ?? Math.max(map.getZoom(), 16.5) });
    dispatch({ type: "handled", what: "fly" });
  }, [state.fly, ready, dispatch]);

  // A tool in hand shows a crosshair.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = state.mode === "view" ? "" : "crosshair";
  }, [state.mode, ready]);

  // The drawing tool follows the state: `draw` puts the named tool in hand, `measure` the measure line, anything else none.
  const drawTool = state.draw?.mode;
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) return;
    const tool: DrawMode | null = state.mode === "measure" ? "measure" : state.mode === "draw" ? ((drawTool as DrawMode | undefined) ?? "select") : null;
    draw.setMode(tool);
  }, [state.mode, drawTool, ready]);

  // Shapes the product already has, shown and editable.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) return;
    draw.clear();
    if (drawFeatures.length) draw.load(drawFeatures);
    setDrawnTags(drawFeatures.filter((f) => f.properties.mode === "measure"));
  }, [drawFeatures, ready]);

  // The measured lines' readouts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(DRAW_TAGS) as maplibregl.GeoJSONSource | undefined)?.setData(tagFeatures(drawnTags));
  }, [drawnTags, ready]);

  useImperativeHandle(
    ref,
    () => ({
      bounds: () => (mapRef.current ? boundsOf(mapRef.current) : null),
      refresh: () => {
        if (mapRef.current) readLayers(mapRef.current);
      },
      cancelDraw: () => drawRef.current?.cancel(),
      credits: () => attributionRef.current,
      removeDrawn: (ids) => {
        drawRef.current?.remove(ids);
        setDrawnTags((prev) => prev.filter((f) => !ids.includes(f.id)));
      },
      capture: async (opts) => {
        const map = mapRef.current;
        if (!map) throw new Error("The map is still loading.");
        const hide = new Set(opts?.hideLayers ?? []);
        const current = featuresRef.current;
        const hiddenLayers = layersRef.current.filter((l) => hide.has(l.key));
        const leftOut =
          (hide.size ? current.features.filter((f) => hide.has(f.properties.layer ?? "")).length : 0) +
          hiddenLayers.reduce((n, l) => n + (layerData[l.key]?.features.length ?? 0), 0);
        const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (hide.size && src) src.setData({ type: "FeatureCollection", features: current.features.filter((f) => !hide.has(f.properties.layer ?? "")) });
        const hiddenIds = hiddenLayers.flatMap(layerIds).filter((id) => map.getLayer(id));
        for (const id of hiddenIds) map.setLayoutProperty(id, "visibility", "none");
        try {
          const dataUrl = await new Promise<string>((resolveUrl) => {
            // WebGL clears its buffer after each frame, so copy inside a render.
            map.once("render", () => resolveUrl(map.getCanvas().toDataURL("image/jpeg", 0.9)));
            map.triggerRepaint();
          });
          const canvas = map.getCanvas();
          return { dataUrl, width: canvas.width, height: canvas.height, leftOut };
        } finally {
          if (hide.size && src) src.setData(current);
          for (const id of hiddenIds) map.setLayoutProperty(id, "visibility", "visible");
        }
      },
    }),
    [layerData, readLayers]
  );

  const locate = () => {
    if (!navigator.geolocation) {
      onProblemRef.current?.("This device cannot report its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        dispatch({ type: "fly", center: at, zoom: Math.max(stateRef.current.camera.zoom, 16) });
        onLocateRef.current?.(at);
      },
      () => onProblemRef.current?.("Location is off for this site or this device."),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const selected = findFeature(state.selection, features, layerData);
  const showZoom = controls?.zoom ?? door !== "field";
  const showLocate = controls?.locate ?? true;

  if (!entitled) {
    return (
      <div className={cn("flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-field text-muted-foreground", className)}>
        {entitledMessage}
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn("flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-field text-muted-foreground", className)}>
        {error}
      </div>
    );
  }
  const control = "flex min-h-target min-w-target items-center justify-center bg-background/95 text-field font-medium text-foreground shadow hover:bg-muted";
  return (
    <div className={cn("relative h-full min-h-[320px] w-full", className)} data-map-source={state.source}>
      <div ref={containerRef} className="h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-border" />
      {(showZoom || showLocate) && (
        <div role="group" aria-label="Map controls" className="absolute right-2 top-2 z-10 flex flex-col gap-1 overflow-hidden rounded-md border border-border">
          {showZoom && (
            <>
              <button type="button" aria-label="Zoom in" className={control} onClick={() => mapRef.current?.zoomIn()}>
                +
              </button>
              <button type="button" aria-label="Zoom out" className={control} onClick={() => mapRef.current?.zoomOut()}>
                −
              </button>
            </>
          )}
          {showLocate && (
            <button type="button" aria-label="Where I am" className={control} onClick={locate}>
              ◎
            </button>
          )}
        </div>
      )}
      {children}
      {!ready && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-field text-muted-foreground">Loading the map</div>}
      <p className="sr-only" aria-live="polite">
        {selected ? `Selected: ${selected.properties.label ?? selected.properties.key}` : ""}
      </p>
      {attribution ? <span className="sr-only">{attribution}</span> : null}
    </div>
  );
});

export default MapView;
