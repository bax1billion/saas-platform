import { getModuleByPath, type ModuleNavItem } from "./index";
import { activeNavHref } from "./active-nav";

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Breadcrumbs for the top bar, from the registry alone: Home, the product,
 * the active tab (from the product's default `nav`; door-aware navs live in
 * the product and the frame never imports one) and the record id when the
 * path goes deeper. Non-product paths get Home plus a known label (the
 * places) or the last segment.
 */
export function crumbsFor(
  pathname: string,
  opts: { homeHref?: string; homeLabel?: string; known?: Readonly<Record<string, string>>; navOverride?: ModuleNavItem[] } = {}
): Crumb[] {
  const { homeHref = "/dashboard", homeLabel = "Home", known = {}, navOverride } = opts;
  const crumbs: Crumb[] = [{ label: homeLabel, href: homeHref }];
  if (pathname === homeHref) return crumbs;
  const mod = getModuleByPath(pathname);
  if (!mod) {
    return [...crumbs, { label: known[pathname] ?? lastSegmentLabel(pathname), href: pathname }];
  }
  crumbs.push({ label: mod.name, href: mod.basePath });
  const nav = navOverride ?? mod.nav;
  const active = activeNavHref(nav, pathname);
  if (active && active !== mod.basePath) {
    const item = nav.find((n) => n.href === active);
    if (item) crumbs.push({ label: item.label, href: active });
  }
  const deepest = active ?? mod.basePath;
  if (pathname !== deepest) crumbs.push({ label: lastSegmentLabel(pathname), href: pathname });
  return crumbs;
}

function lastSegmentLabel(p: string): string {
  const s = p.split("/").filter(Boolean).pop() ?? "";
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}
