"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { shellLabels } from "@/config/shell";
import type { SidebarState } from "@/lib/hooks/layout-mode";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

/**
 * Expand or collapse by hand. The choice is remembered and wins over the
 * automatic rule; "follow the rule again" is the Reset line in the avatar
 * menu and on Me, so a third tap here never clears the override by surprise.
 */
export default function SidebarToggle({ state }: { state: SidebarState }) {
  const { setManual } = useSidebar();
  const full = state === "full";
  const label = full ? shellLabels.collapse : shellLabels.expand;
  const Icon = full ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      onClick={() => setManual(full ? "compact" : "full")}
      aria-expanded={full}
      aria-controls="global-sidebar"
      aria-label={label}
      title={label}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        full ? "w-full px-3" : "w-full justify-center px-1"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {full && <span>Collapse</span>}
    </button>
  );
}
