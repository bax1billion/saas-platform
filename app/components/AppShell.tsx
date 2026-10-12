"use client";

import type { CSSProperties, ReactNode } from "react";
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
 * knowing which module it is in. The door provider sits above, in
 * `app/(app)/layout.tsx`, because it needs a signed-in member.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentModule = getModuleByPath(pathname);
  const shellStyle = {
    "--module-accent": currentModule?.accent ?? "var(--primary)",
  } as CSSProperties;

  return (
    <SidebarProvider>
      <ShellFrame style={shellStyle}>{children}</ShellFrame>
    </SidebarProvider>
  );
}
