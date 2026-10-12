"use client";

import { useSyncExternalStore } from "react";
import { useDoor } from "@/app/components/DoorContext";
import { useSidebar } from "@/app/components/shell/SidebarContext";
import { BREAKPOINTS, layoutModeFor, type LayoutMode } from "./layout-mode";

const QUERIES = [BREAKPOINTS.md, BREAKPOINTS.lg, BREAKPOINTS.xl].map((px) => `(min-width: ${px}px)`);

function subscribe(onChange: () => void) {
  const lists = QUERIES.map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

// The snapshot is the widest matching breakpoint, not the live width, so the
// store only changes when a breakpoint flips (no resize storms).
const getWidthClass = () => QUERIES.filter((q) => window.matchMedia(q).matches).length;
// Desktop first on the server; corrected after hydration by React itself.
const getWidthClassServer = () => QUERIES.length;
const WIDTH_FOR_CLASS = [0, BREAKPOINTS.md, BREAKPOINTS.lg, BREAKPOINTS.xl];

/**
 * The live layout: device, which navigation the frame draws (toolbar or
 * sidebar) and the sidebar state. Same `useSyncExternalStore` over
 * `matchMedia` shape as `useFieldStationMode`. Only runs under the second
 * shell, where `DoorProvider` and `SidebarProvider` are mounted.
 */
export function useLayoutMode(): LayoutMode {
  const widthClass = useSyncExternalStore(subscribe, getWidthClass, getWidthClassServer);
  const [door] = useDoor();
  const { manual, railOpen } = useSidebar();
  return layoutModeFor({ width: WIDTH_FOR_CLASS[widthClass], door, railOpen, manual });
}
