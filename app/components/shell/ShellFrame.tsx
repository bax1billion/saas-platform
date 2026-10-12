"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useLayoutMode } from "@/lib/hooks/useLayoutMode";
import { useShellPreference } from "@/lib/shell/useShellPreference";
import { useEntitlements } from "../EntitlementsContext";
import PastDueBanner from "../PastDueBanner";
import SubscriptionRequiredBanner from "../SubscriptionRequiredBanner";
import FloatingToolbar from "./FloatingToolbar";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

/**
 * The second shell's frame: reads the layout rule once and draws the bars
 * around the canvas. The canvas always gets priority: the top bar is sticky
 * and in flow, the sidebar keeps its own column, and on the toolbar layout
 * the canvas gets bottom padding equal to the capsule plus the safe area so
 * nothing is covered. Needs `SidebarProvider` and `DoorProvider` above it.
 */
export default function ShellFrame({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const { nav, sidebar } = useLayoutMode();
  const { status, needsSubscription } = useEntitlements();
  const { textSize } = useShellPreference();
  const toolbar = nav === "toolbar";

  // Text size is a root attribute so rem spacing scales with the type (globals.css).
  useEffect(() => {
    const el = document.documentElement;
    if (textSize === "standard") delete el.dataset.textSize;
    else el.dataset.textSize = textSize;
    return () => {
      delete el.dataset.textSize;
    };
  }, [textSize]);

  return (
    <div className="flex min-h-screen bg-muted" style={style} data-nav={nav} data-sidebar={sidebar}>
      <Sidebar state={sidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar toolbar={toolbar} />
        {status === "PAST_DUE" && <PastDueBanner />}
        {needsSubscription && <SubscriptionRequiredBanner />}
        <main
          id="main"
          className="flex-1"
          style={toolbar ? { paddingBottom: "calc(var(--toolbar-h) + max(14px, env(safe-area-inset-bottom)) + 14px)" } : undefined}
        >
          {children}
        </main>
      </div>
      {toolbar && <FloatingToolbar />}
      <Toaster position={toolbar ? "top-center" : "bottom-right"} />
    </div>
  );
}
