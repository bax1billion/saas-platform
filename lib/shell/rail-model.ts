/**
 * The section rail's data and rules (docs/shell.md, Section rail). Pure.
 *
 * A page declares its sections, record tabs or workflow stages once through
 * `useSections`; the app frame draws them as a sticky rail beside the canvas
 * (desktop) or a chip strip under the top bar (iPad and phone). The page
 * never draws a rail of its own.
 */
/**
 * sections: anchors on one page, scroll spy. stages: the same with a status
 * per step. tabs: panels the page swaps in place. routes: the product's
 * level-2 pages, links the frame draws so a product never draws its own
 * tab strip; `ModuleShell` registers them as the default for every product.
 */
export type RailMode = "sections" | "tabs" | "stages" | "routes";
export type RailTone = "default" | "success" | "warning" | "danger";
export type StageStatus = "done" | "next" | "todo" | "blocked";

export interface RailItem {
  id: string;
  label: string;
  /** Always text ("3/5", "Done", "2 open"), never colour alone. */
  badge?: string;
  tone?: RailTone;
  /** Stages only. */
  status?: StageStatus;
  /** Routes only: the page the item opens. */
  href?: string;
  disabled?: boolean;
}

export interface RailSpec {
  mode: RailMode;
  /** The `nav` landmark's label, e.g. "Chart sections". */
  label: string;
  items: RailItem[];
  /** Tabs mode: the page owns the selection. */
  activeId?: string;
  onSelect?: (id: string) => void;
}

export type RailVariant = "rail" | "strip";

export const MIN_RAIL_ITEMS = 3;

/** The class a page puts on each section wrapper so a jump clears the sticky bars. */
export const SECTION_CLASS = "section-anchor outline-none";

/** Only a desk layout on a desktop gets the vertical rail; everything else is the strip. */
export function railVariantFor(l: { device: "phone" | "tablet" | "desktop"; nav: "toolbar" | "sidebar" }): RailVariant {
  return l.device === "desktop" && l.nav === "sidebar" ? "rail" : "strip";
}

/** Fewer than three sections (two tabs or routes) is not worth a navigator. */
export function worthShowing(s: Pick<RailSpec, "mode" | "items">): boolean {
  return s.items.length >= (s.mode === "tabs" || s.mode === "routes" ? 2 : MIN_RAIL_ITEMS);
}

/** A product's nav as route items; the href doubles as the id. */
export function routeItems(nav: readonly { label: string; href: string }[]): RailItem[] {
  return nav.map((n) => ({ id: n.href, href: n.href, label: n.label }));
}

/** "3/5" until done, "Done" after; nothing when there is nothing to count. */
export function progressBadge(done: number, total: number): { badge?: string; tone: RailTone } {
  if (total <= 0) return { tone: "default" };
  return done >= total ? { badge: "Done", tone: "success" } : { badge: `${done}/${total}`, tone: "default" };
}

/**
 * Arrow keys move focus along the rail's axis; Home and End jump; it wraps.
 * `null` means the key is not ours and the browser keeps it.
 */
export function nextFocusIndex(key: string, index: number, count: number, orientation: "vertical" | "horizontal"): number | null {
  if (count <= 0) return null;
  const [back, forward] = orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (key === back) return (index - 1 + count) % count;
  if (key === forward) return (index + 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The first stage still to do is the one marked next. */
export function markNext(items: RailItem[]): RailItem[] {
  const first = items.findIndex((i) => i.status === "todo");
  return items.map((i, n) => (n === first ? { ...i, status: "next" as const } : i));
}
