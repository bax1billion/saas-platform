"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot, Lock } from "lucide-react";
import { useDoor } from "../DoorContext";
import { useLayoutMode } from "@/lib/hooks/useLayoutMode";
import { useScrollSpy } from "@/lib/hooks/useScrollSpy";
import { nextFocusIndex, railVariantFor, worthShowing, type RailItem, type RailTone, type RailVariant, type StageStatus } from "@/lib/shell/rail-model";
import { cn } from "@/lib/utils";
import { useRailJump, useRailSpec } from "./SectionRailContext";
import { useSidebar } from "./SidebarContext";

const RAIL = "sticky top-[var(--bs-top-h)] max-h-[calc(100dvh-var(--bs-top-h))] w-48 shrink-0 self-start overflow-y-auto border-r p-3 xl:w-56";
// The strip wraps onto more rows rather than scrolling sideways: every chip
// stays in view and nothing on a phone scrolls sideways (docs/shell.md).
const STRIP = "border-b px-4 py-2";
/** A chip on the strip sizes to its label, never wider than the row. */
const CHIP = "w-auto max-w-full";
const ITEM =
  "relative flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md px-3 text-left text-base text-foreground/80 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TONE: Record<RailTone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const STAGE: Record<StageStatus, { Icon: typeof Check; word: string }> = {
  done: { Icon: Check, word: "done" },
  next: { Icon: CircleDot, word: "next" },
  todo: { Icon: Circle, word: "to do" },
  blocked: { Icon: Lock, word: "blocked" },
};

/**
 * The shared section navigator (docs/shell.md, Section rail). One
 * component, two variants, three modes. `ModuleShell` mounts both variants;
 * each returns null unless it is the active one for the live layout, so
 * only one draws. Only the vertical rail collapses the global sidebar; a
 * strip never touches it. Sections and stages run the scroll spy; tabs mode
 * hands selection to the page; routes mode draws the product's level-2
 * pages as links (the default `ModuleShell` registers for every product).
 */
export default function SectionRail({ variant }: { variant: RailVariant }) {
  const spec = useRailSpec();
  const layout = useLayoutMode();
  const [door] = useDoor();
  const { setRailOpen } = useSidebar();
  const jumpReq = useRailJump();
  const mine = !!spec && worthShowing(spec) && railVariantFor(layout) === variant;
  const vertical = variant === "rail";
  // Only the phone strip scrolls away with the content (chrome budget).
  const sticky = layout.device !== "phone";
  // The spec object is stable between registrations, so the id list is too.
  const ids = useMemo(() => spec?.items.map((i) => i.id) ?? [], [spec]);
  const [stripH, setStripH] = useState(0);
  const spy = spec?.mode === "sections" || spec?.mode === "stages";
  const { activeId, jump } = useScrollSpy({ ids, enabled: mine && spy, watchKey: stripH });
  const buttons = useRef<Array<HTMLElement | null>>([]);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mine || !vertical) return;
    setRailOpen(true);
    return () => setRailOpen(false);
  }, [mine, vertical, setRailOpen]);

  useEffect(() => {
    if (mine && jumpReq) jump(jumpReq.id);
  }, [mine, jumpReq, jump]);

  // A sticky strip is a bar: measure it and publish the height so section
  // anchors and the reading band clear it. The callback is asynchronous.
  useEffect(() => {
    const el = navRef.current;
    const root = document.documentElement;
    if (!mine || vertical || !sticky || !el || typeof ResizeObserver === "undefined") {
      root.style.setProperty("--bs-rail-h", "0px");
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect.height ?? 0);
      root.style.setProperty("--bs-rail-h", `${h}px`);
      setStripH(h);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--bs-rail-h", "0px");
    };
  }, [mine, vertical, sticky]);

  if (!mine || !spec) return null;

  const tabs = spec.mode === "tabs";
  const routes = spec.mode === "routes";
  const current = tabs || routes ? spec.activeId : (activeId ?? ids[0]);
  const field = door === "field";
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = nextFocusIndex(e.key, i, spec.items.length, vertical ? "vertical" : "horizontal");
    if (next === null) return;
    e.preventDefault();
    buttons.current[next]?.focus();
    if (tabs) spec.onSelect?.(spec.items[next].id);
  };
  const activate = (item: RailItem) => {
    if (item.disabled) return;
    if (tabs) spec.onSelect?.(item.id);
    else jump(item.id);
  };
  const marker = (on: boolean) =>
    on ? (
      <span
        aria-hidden
        className={cn("absolute rounded-full bg-[var(--module-accent)]", vertical ? "inset-y-2 left-0 w-0.5" : "inset-x-3 bottom-0 h-0.5")}
      />
    ) : null;

  const renderItem = (item: RailItem, i: number) => {
    const on = item.id === current;
    const stage = spec.mode === "stages" && item.status ? STAGE[item.status] : null;
    if (routes && item.href) {
      // A level-2 page is a link, so the browser and assistive tech treat it as one.
      return (
        <Link
          key={item.id}
          href={item.href}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          onKeyDown={(e) => onKey(e, i)}
          aria-current={on ? "page" : undefined}
          className={cn(ITEM, !vertical && CHIP, field && "min-h-target text-field", on && "font-semibold text-foreground")}
        >
          {marker(on)}
          <span className="truncate">{item.label}</span>
          {item.badge && <span className={cn("ml-auto pl-2 text-sm tabular-nums", TONE[item.tone ?? "default"])}>{item.badge}</span>}
        </Link>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        ref={(el) => {
          buttons.current[i] = el;
        }}
        onKeyDown={(e) => onKey(e, i)}
        onClick={() => activate(item)}
        disabled={item.disabled}
        role={tabs ? "tab" : undefined}
        aria-selected={tabs ? on : undefined}
        tabIndex={tabs ? (on ? 0 : -1) : undefined}
        aria-current={!tabs && on ? (spec.mode === "stages" ? "step" : "location") : undefined}
        className={cn(ITEM, !vertical && CHIP, field && "min-h-target text-field", on && "font-semibold text-foreground", item.disabled && "opacity-50")}
      >
        {marker(on)}
        {stage && (
          <>
            <stage.Icon className={cn("h-4 w-4 shrink-0", item.status === "done" && "text-success", item.status === "blocked" && "text-muted-foreground")} aria-hidden />
            <span className="sr-only">{stage.word}: </span>
          </>
        )}
        <span className="truncate">{item.label}</span>
        {item.badge && <span className={cn("ml-auto pl-2 text-sm tabular-nums", TONE[item.tone ?? "default"])}>{item.badge}</span>}
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label={spec.label}
      data-section-rail
      className={cn("border-border bg-background print:hidden", vertical ? RAIL : STRIP, !vertical && sticky && "sticky top-[var(--bs-top-h)] z-30")}
    >
      {tabs ? (
        <div role="tablist" aria-orientation={vertical ? "vertical" : "horizontal"} className={cn("flex gap-1", vertical ? "flex-col" : "flex-wrap")}>
          {spec.items.map(renderItem)}
        </div>
      ) : (
        <ul className={cn("flex gap-1", vertical ? "flex-col" : "flex-wrap")}>
          {spec.items.map((item, i) => (
            <li key={item.id} className={cn(!vertical && "max-w-full")}>
              {renderItem(item, i)}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
