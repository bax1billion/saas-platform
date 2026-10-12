/**
 * The one layout rule for the app frame (docs/shell.md). Pure: no React, no
 * DOM, so the whole decision is a table test. `useLayoutMode` renders it.
 *
 * Read it out loud: under `md` the phone toolbar; `md` to `lg` a desk door
 * gets a COMPACT rail (never nothing); `lg` to `xl` COMPACT; `xl` and up
 * FULL unless a product section rail is open; the Field door is the
 * toolbar below `xl`; a manual choice wins whenever a sidebar is on screen
 * at all, and can never force a sidebar onto a phone.
 */
export type Door = "field" | "station" | "admin";
export type Device = "phone" | "tablet" | "desktop";
export type NavKind = "toolbar" | "sidebar";
export type SidebarState = "full" | "compact" | "hidden";
/** The member's own choice; `null` follows the rule. */
export type ManualSidebar = "full" | "compact" | null;

/** Tailwind v4 defaults; the repo already switches its rail on `lg`. */
export const BREAKPOINTS = { md: 768, lg: 1024, xl: 1280 } as const;

export interface LayoutInput {
  width: number;
  door: Door;
  /** A product's vertical section rail is mounted on this page. */
  railOpen: boolean;
  manual: ManualSidebar;
}

export interface LayoutMode {
  device: Device;
  nav: NavKind;
  sidebar: SidebarState;
}

export function deviceFor(width: number): Device {
  if (width < BREAKPOINTS.md) return "phone";
  if (width < BREAKPOINTS.lg) return "tablet";
  return "desktop";
}

export function layoutModeFor({ width, door, railOpen, manual }: LayoutInput): LayoutMode {
  const device = deviceFor(width);
  const toolbar = width < BREAKPOINTS.md || (door === "field" && width < BREAKPOINTS.xl);
  if (toolbar) return { device, nav: "toolbar", sidebar: "hidden" };
  const auto: SidebarState = width < BREAKPOINTS.xl || railOpen ? "compact" : "full";
  return { device, nav: "sidebar", sidebar: manual ?? auto };
}
