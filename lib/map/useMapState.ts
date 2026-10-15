"use client";

import { useReducer, type Dispatch } from "react";
import { initialMapState, mapReducer, type MapAction, type MapState, type MapStateInit } from "./state";

/** The map state for a screen that renders `MapView`; the screen dispatches, the map performs. */
export function useMapState(init: MapStateInit): [MapState, Dispatch<MapAction>] {
  return useReducer(mapReducer, init, initialMapState);
}
