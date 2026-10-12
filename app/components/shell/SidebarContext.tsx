"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ManualSidebar } from "@/lib/hooks/layout-mode";
import {
  readShellPreference,
  subscribeShellPreference,
  writeShellPreference,
} from "@/lib/shell/preference-store";

interface SidebarCtx {
  /** The member's own choice; `null` follows the layout rule. */
  manual: ManualSidebar;
  setManual: (m: ManualSidebar) => void;
  /** A product's vertical section rail is mounted on this page. */
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
}

const Ctx = createContext<SidebarCtx | null>(null);

const readManual = (): ManualSidebar => readShellPreference().sidebar;
const readManualServer = (): ManualSidebar => null;

/**
 * Holds the two inputs to the layout rule that are not a media query: the
 * member's manual expand or collapse (an external store, so no effect sets
 * state to pick it up) and whether a section rail is open (`SectionRail`
 * sets it on mount and clears it on unmount; nothing else touches it).
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const manual = useSyncExternalStore(subscribeShellPreference, readManual, readManualServer);
  const [railOpen, setRailOpen] = useState(false);
  const setManual = useCallback((m: ManualSidebar) => {
    writeShellPreference({ sidebar: m });
  }, []);
  const value = useMemo(() => ({ manual, setManual, railOpen, setRailOpen }), [manual, setManual, railOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSidebar(): SidebarCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSidebar must be used inside SidebarProvider (app/components/AppShell.tsx)");
  return ctx;
}
