"use client";

import { useState, useSyncExternalStore } from "react";

export type FieldStationMode = "field" | "station";

function subscribeCoarsePointer(onChange: () => void) {
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getCoarsePointer = () => window.matchMedia("(pointer: coarse)").matches;
// Server has no pointer at all — default to Station, corrected client-side
// post-hydration by React itself, with no risk of a hydration-mismatch
// warning since useSyncExternalStore is exactly the tool built for this.
const getCoarsePointerServer = () => false;

/**
 * Field is touch, station is keyboard. A coarse pointer (touch) reads as
 * Field, a fine pointer (mouse/trackpad) as Station; a manual override
 * always wins after that and is never clobbered by a later pointer-type
 * change (rotating a tablet, plugging in a mouse).
 *
 * Shared so every module with a field/station door split uses one
 * detection rule instead of re-deriving it per module. (A module that
 * predates this hook may still carry a local copy; migrate it when that
 * module is next touched.)
 */
export function useFieldStationMode(): [FieldStationMode, (mode: FieldStationMode | null) => void] {
  const isCoarsePointer = useSyncExternalStore(subscribeCoarsePointer, getCoarsePointer, getCoarsePointerServer);
  const [manualMode, setManualMode] = useState<FieldStationMode | null>(null);
  const mode: FieldStationMode = manualMode ?? (isCoarsePointer ? "field" : "station");
  return [mode, setManualMode];
}
