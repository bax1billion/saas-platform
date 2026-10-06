import type { ModuleNavItem } from "./types";

/**
 * The one nav item to underline for `pathname`: the item whose href is the
 * longest match (exact, or a parent segment of the path). Without this, an
 * item pointing at the module root ("/widgets", the module home) matched every
 * page under it and stayed underlined next to the real tab. Navs with no
 * nested hrefs resolve exactly as the old per-item prefix check did.
 */
export function activeNavHref(nav: ModuleNavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of nav) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}
