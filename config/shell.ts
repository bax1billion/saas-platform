/**
 * The app frame's product-facing values (docs/shell.md). Downstream-owned,
 * like config/site.ts: the foundation ships a small, neutral default and a
 * product replaces the places, the strings and the Admin homes with its
 * own. Nothing here is read by the backend.
 */

/**
 * The places: the top of the sidebar on a desk, the floating toolbar on a
 * phone. Icons are lucide names as strings so this file stays React free;
 * the frame maps them in app/components/shell/place-icons.ts (add a name
 * there when a place needs an icon the map lacks).
 */
export interface ShellPlace {
  id: string;
  label: string;
  href: string;
  icon: string;
}

export const shellPlaces: ShellPlace[] = [
  { id: "home", label: "Home", href: "/dashboard", icon: "House" },
  { id: "me", label: "Me", href: "/me", icon: "CircleUser" },
];

/**
 * Extra sidebar sections under the module lineup (a product's testing
 * lane, a tools section): a label and its links, drawn after the groups
 * and before Settings. Icons are lucide names, as for the places.
 */
export interface ShellSidebarSection {
  label: string;
  items: { href: string; label: string; shortLabel?: string; icon: string }[];
}

export const shellSidebarSections: ShellSidebarSection[] = [];

/** Strings the frame shows; a product never hardcodes them. */
export const shellLabels = {
  expand: "Expand sidebar",
  collapse: "Collapse sidebar",
  resetSidebar: "Reset sidebar to automatic",
  search: "Search or jump to",
  notifications: "Notifications",
  account: "Account",
  flagIt: "Flag it",
  door: "Door",
  autoDoor: "Use automatic door",
  textSize: "Text size",
  quick: "Quick",
  signOut: "Sign out",
  organization: "Organization",
  billing: "Billing",
} as const;

/** The three doors (docs/shell.md, Doors): touch, desk, settings. */
export const doorLabels = { field: "Field", station: "Station", admin: "Admin" } as const;

export const textSizeLabels = { standard: "Standard", large: "Large", largest: "Largest" } as const;

/** Default landmark labels for the section rail when a page does not name its own. */
export const railLabels = { sections: "Sections", tabs: "Record tabs", stages: "Steps" } as const;

/**
 * Module id to the page an Admin lands on when they pick the Admin door.
 * A product adds its line the day its Admin route exists.
 */
export const adminHomes: Record<string, string> = {};
