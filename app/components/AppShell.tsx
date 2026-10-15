"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getModuleByPath } from "@/lib/modules";
import { SidebarProvider } from "./shell/SidebarContext";
import ShellFrame from "./shell/ShellFrame";

/**
 * Authenticated app frame (docs/shell.md): the global sidebar in its three
 * states, the top bar, the phone toolbar and the banners around the canvas.
 * `ShellFrame` reads the layout rule; this component only mounts the
 * sidebar state provider and exposes the current module's accent as
 * `--module-accent` on the root so module UI can tint itself without
 * knowing which module it is in. It is set on the document element as
 * well: dialogs, sheets and toasts render in a portal under <body>, outside
 * this tree, and without it a control filled with the accent there comes
 * out transparent. The door provider sits above, in
 * `app/(app)/layout.tsx`, because it needs a signed-in member.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentModule = getModuleByPath(pathname);
  const accent = currentModule?.accent ?? "var(--primary)";
  const shellStyle = { "--module-accent": accent } as CSSProperties;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--module-accent", accent);
    return () => {
      root.style.removeProperty("--module-accent");
    };
  }, [accent]);

  return (
    <SidebarProvider>
      <ShellFrame style={shellStyle}>{children}</ShellFrame>
    </SidebarProvider>
  );
}
