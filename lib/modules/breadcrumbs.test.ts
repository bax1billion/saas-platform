import { describe, expect, it } from "vitest";
import { modules } from "@/config/modules";
import { crumbsFor } from "./breadcrumbs";
import { activeNavHref } from "./active-nav";

const HOME = { label: "Home", href: "/dashboard" };
// The registry is the product's; the module cases run against its first
// entry and skip on a foundation with no module yet.
const first = modules[0];

describe("crumbsFor", () => {
  it("is Home alone on the home page", () => {
    expect(crumbsFor("/dashboard")).toEqual([HOME]);
  });

  it.skipIf(!first)("adds the module, the tab the registry nav carries, and the record id", () => {
    const path = `${first.basePath}/records/abc123`;
    const active = activeNavHref(first.nav, path);
    const crumbs = crumbsFor(path);
    expect(crumbs[0]).toEqual(HOME);
    expect(crumbs[1]).toEqual({ label: first.name, href: first.basePath });
    if (active && active !== first.basePath) {
      expect(crumbs[2]).toEqual({ label: first.nav.find((n) => n.href === active)!.label, href: active });
      expect(crumbs.length).toBe(active === path ? 3 : 4);
    } else {
      expect(crumbs[2]).toEqual({ label: "abc123", href: path });
    }
  });

  it("uses a known label for a place and the segment otherwise", () => {
    expect(crumbsFor("/work", { known: { "/work": "My work" } })).toEqual([HOME, { label: "My work", href: "/work" }]);
    expect(crumbsFor("/settings")).toEqual([HOME, { label: "settings", href: "/settings" }]);
    expect(crumbsFor("/nope")).toEqual([HOME, { label: "nope", href: "/nope" }]);
  });

  it("shortens a long record id", () => {
    const crumbs = crumbsFor("/nope/rec-0123456789abcdef");
    expect(crumbs.at(-1)!.label).toBe("rec-0123…");
  });
});
