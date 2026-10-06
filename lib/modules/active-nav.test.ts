import { describe, expect, it } from "vitest";
import { activeNavHref } from "./active-nav";

const nav = [
  { label: "Dashboard", href: "/widgets" },
  { label: "Review queue", href: "/widgets/admin/review-queue" },
  { label: "Pick lists", href: "/widgets/admin/pick-lists" },
];

describe("activeNavHref", () => {
  it("underlines the module-root item only on the root itself", () => {
    expect(activeNavHref(nav, "/widgets")).toBe("/widgets");
  });

  it("prefers the deeper item over the module root", () => {
    expect(activeNavHref(nav, "/widgets/admin/review-queue")).toBe("/widgets/admin/review-queue");
  });

  it("keeps a parent item active on its child pages", () => {
    expect(activeNavHref([{ label: "Widgets", href: "/widgets" }], "/widgets/items/w-846")).toBe("/widgets");
  });

  it("does not treat a shared string prefix as a parent segment", () => {
    expect(activeNavHref([{ label: "Widget", href: "/widgets" }], "/widgets-archive")).toBeNull();
  });

  it("matches the old behavior for navs with no nested hrefs", () => {
    const flat = [
      { label: "List", href: "/reports/list" },
      { label: "Trends", href: "/reports/trends" },
    ];
    expect(activeNavHref(flat, "/reports/list/c-1")).toBe("/reports/list");
    expect(activeNavHref(flat, "/reports")).toBeNull();
  });
});
