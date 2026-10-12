import { describe, expect, it } from "vitest";
import { markNext, nextFocusIndex, progressBadge, railVariantFor, routeItems, worthShowing, type RailItem } from "./rail-model";

describe("railVariantFor", () => {
  it("is the vertical rail only for a desktop with a sidebar", () => {
    expect(railVariantFor({ device: "desktop", nav: "sidebar" })).toBe("rail");
    expect(railVariantFor({ device: "desktop", nav: "toolbar" })).toBe("strip");
    expect(railVariantFor({ device: "tablet", nav: "sidebar" })).toBe("strip");
    expect(railVariantFor({ device: "tablet", nav: "toolbar" })).toBe("strip");
    expect(railVariantFor({ device: "phone", nav: "toolbar" })).toBe("strip");
    expect(railVariantFor({ device: "phone", nav: "sidebar" })).toBe("strip");
  });
});

describe("worthShowing", () => {
  const items = (n: number): RailItem[] => Array.from({ length: n }, (_, i) => ({ id: String(i), label: String(i) }));
  it("needs three sections, or two tabs", () => {
    expect(worthShowing({ mode: "sections", items: items(2) })).toBe(false);
    expect(worthShowing({ mode: "sections", items: items(3) })).toBe(true);
    expect(worthShowing({ mode: "stages", items: items(2) })).toBe(false);
    expect(worthShowing({ mode: "tabs", items: items(2) })).toBe(true);
    expect(worthShowing({ mode: "tabs", items: items(1) })).toBe(false);
    expect(worthShowing({ mode: "routes", items: items(2) })).toBe(true);
    expect(worthShowing({ mode: "routes", items: items(1) })).toBe(false);
  });
});

describe("routeItems", () => {
  it("turns a product nav into route items keyed by href", () => {
    expect(routeItems([{ label: "List", href: "/widgets/list" }, { label: "Trends", href: "/widgets/trends" }])).toEqual([
      { id: "/widgets/list", href: "/widgets/list", label: "List" },
      { id: "/widgets/trends", href: "/widgets/trends", label: "Trends" },
    ]);
  });
});

describe("progressBadge", () => {
  it("counts until done, then says Done", () => {
    expect(progressBadge(0, 0)).toEqual({ tone: "default" });
    expect(progressBadge(2, 5)).toEqual({ badge: "2/5", tone: "default" });
    expect(progressBadge(5, 5)).toEqual({ badge: "Done", tone: "success" });
  });
});

describe("nextFocusIndex", () => {
  it("moves along the axis and wraps at both ends", () => {
    expect(nextFocusIndex("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(nextFocusIndex("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(nextFocusIndex("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(nextFocusIndex("ArrowRight", 2, 3, "horizontal")).toBe(0);
    expect(nextFocusIndex("ArrowLeft", 0, 3, "horizontal")).toBe(2);
  });
  it("handles Home and End", () => {
    expect(nextFocusIndex("Home", 2, 3, "vertical")).toBe(0);
    expect(nextFocusIndex("End", 0, 3, "horizontal")).toBe(2);
  });
  it("leaves other keys, the wrong axis and an empty rail alone", () => {
    expect(nextFocusIndex("a", 0, 3, "vertical")).toBeNull();
    expect(nextFocusIndex("ArrowRight", 0, 3, "vertical")).toBeNull();
    expect(nextFocusIndex("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(nextFocusIndex("ArrowDown", 0, 0, "vertical")).toBeNull();
  });
});

describe("markNext", () => {
  it("marks only the first todo and leaves done alone", () => {
    const out = markNext([
      { id: "a", label: "A", status: "done" },
      { id: "b", label: "B", status: "todo" },
      { id: "c", label: "C", status: "todo" },
    ]);
    expect(out.map((i) => i.status)).toEqual(["done", "next", "todo"]);
  });
  it("marks nothing when nothing is todo", () => {
    const out = markNext([{ id: "a", label: "A", status: "done" }, { id: "b", label: "B", status: "blocked" }]);
    expect(out.map((i) => i.status)).toEqual(["done", "blocked"]);
  });
});
