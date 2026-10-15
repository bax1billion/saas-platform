/**
 * The one map state (docs/map-engine.md § 4.1). `MapView` renders
 * it and nothing else holds map state: the camera, the basemap, where the
 * tiles come from right now, which layers show, the one selected feature,
 * the mode and the shape in hand. Pure, so it is tested without a browser;
 * the reducer never knows what a layer key or a feature key means.
 */
export interface LngLat {
  lng: number;
  lat: number;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Camera {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

/** The basemaps a provider may offer (docs/map-engine.md § 2). */
export type BasemapId = "streets" | "satellite" | "grid";

/** Where tiles come from right now; the shell's sync pill says "Map from the pack" for `pack`. */
export type MapSource = "online" | "pack";

export type MapMode = "view" | "draw" | "measure" | "place";

/** The drawing tool's state; MAP-07 fills it in. */
export interface DrawState {
  mode: string;
  featureId: string | null;
  geometry: GeoJSON.Geometry | null;
}

export interface MapState {
  camera: Camera;
  basemap: BasemapId;
  source: MapSource;
  /** Visibility by layer key, from the registry. */
  layers: Record<string, boolean>;
  /** The one selected feature, by key. */
  selection: string | null;
  mode: MapMode;
  draw: DrawState | null;
  /** One-shot camera requests; `MapView` performs them and dispatches `handled`. */
  fit: { bounds: Bounds; key: number } | null;
  fly: { center: LngLat; zoom?: number; key: number } | null;
  /** Counts the one-shot requests so each is new to the map. */
  seq: number;
}

export type MapAction =
  | { type: "camera"; camera: Camera }
  | { type: "basemap"; basemap: BasemapId }
  | { type: "source"; source: MapSource }
  | { type: "layer"; key: string; on: boolean }
  | { type: "layers"; layers: Record<string, boolean> }
  | { type: "select"; key: string | null }
  | { type: "mode"; mode: MapMode }
  | { type: "draw"; draw: DrawState | null }
  | { type: "fit"; bounds: Bounds }
  | { type: "fly"; center: LngLat; zoom?: number }
  | { type: "handled"; what: "fit" | "fly" };

export interface MapStateInit {
  center: LngLat;
  zoom?: number;
  basemap?: BasemapId;
  layers?: Record<string, boolean>;
  mode?: MapMode;
}

export function initialMapState(init: MapStateInit): MapState {
  return {
    camera: { center: init.center, zoom: init.zoom ?? 12, bearing: 0, pitch: 0 },
    basemap: init.basemap ?? "streets",
    source: "online",
    layers: { ...(init.layers ?? {}) },
    selection: null,
    mode: init.mode ?? "view",
    draw: null,
    fit: null,
    fly: null,
    seq: 0,
  };
}

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "camera":
      return { ...state, camera: action.camera };
    case "basemap":
      // The camera stays where it is: a basemap is a different picture of the same place.
      return state.basemap === action.basemap ? state : { ...state, basemap: action.basemap };
    case "source":
      return state.source === action.source ? state : { ...state, source: action.source };
    case "layer":
      return state.layers[action.key] === action.on ? state : { ...state, layers: { ...state.layers, [action.key]: action.on } };
    case "layers":
      return { ...state, layers: { ...action.layers } };
    case "select":
      // A tap while drawing, measuring or placing is the tool's, not a selection.
      if (state.mode !== "view") return state;
      return state.selection === action.key ? state : { ...state, selection: action.key };
    case "mode":
      if (state.mode === action.mode) return state;
      // Leaving a tool drops the shape in hand; the owner saved it or cancelled.
      return { ...state, mode: action.mode, draw: action.mode === "draw" || action.mode === "measure" ? state.draw : null };
    case "draw":
      return { ...state, draw: action.draw };
    case "fit": {
      const seq = state.seq + 1;
      return { ...state, seq, fit: { bounds: action.bounds, key: seq }, fly: null };
    }
    case "fly": {
      const seq = state.seq + 1;
      return { ...state, seq, fly: { center: action.center, zoom: action.zoom, key: seq }, fit: null };
    }
    case "handled":
      if (action.what === "fit") return state.fit ? { ...state, fit: null } : state;
      return state.fly ? { ...state, fly: null } : state;
    default:
      return state;
  }
}

/** The bounds as MapLibre takes them. */
export const boundsArray = (b: Bounds): [number, number, number, number] => [b.west, b.south, b.east, b.north];
