import { describe, expect, it } from "vitest";
import { computeRootMargin, isAtBottom, pickActiveId, readPx } from "./scroll-spy";

describe("readPx", () => {
  it("reads a plain pixel value and trims it", () => {
    expect(readPx("56px", 0)).toBe(56);
    expect(readPx(" 56px ", 0)).toBe(56);
  });
  it("falls back on anything that is not plain px", () => {
    expect(readPx("", 56)).toBe(56);
    expect(readPx(undefined, 56)).toBe(56);
    expect(readPx("calc(1px + 2px)", 56)).toBe(56);
    expect(readPx("3.5rem", 56)).toBe(56);
    expect(readPx("-4px", 56)).toBe(56);
  });
});

describe("computeRootMargin", () => {
  it("starts the band under the bars and makes it 15 percent of the viewport", () => {
    expect(computeRootMargin({ topBarPx: 56, railPx: 0, viewportPx: 900 })).toBe("-64px 0px -701px 0px");
    expect(computeRootMargin({ topBarPx: 56, railPx: 52, viewportPx: 900 })).toBe("-116px 0px -649px 0px");
  });
  it("never returns a negative bottom on a short viewport", () => {
    expect(computeRootMargin({ topBarPx: 56, railPx: 52, viewportPx: 200 })).toBe("-116px 0px -36px 0px");
    expect(computeRootMargin({ topBarPx: 56, railPx: 52, viewportPx: 100 })).toBe("-116px 0px -0px 0px");
  });
});

describe("pickActiveId", () => {
  const order = ["a", "b", "c"];
  it("takes the first id in document order that is in the band", () => {
    expect(pickActiveId(order, new Set(["c", "b"]), "a")).toBe("b");
  });
  it("keeps the previous answer when nothing is in the band", () => {
    expect(pickActiveId(order, new Set(), "b")).toBe("b");
  });
  it("falls to the first id when the previous one is gone", () => {
    expect(pickActiveId(order, new Set(), "zzz")).toBe("a");
    expect(pickActiveId(order, new Set(), null)).toBe("a");
  });
  it("returns null for an empty order", () => {
    expect(pickActiveId([], new Set(), null)).toBeNull();
  });
});

describe("isAtBottom", () => {
  it("is true at the bottom, within the slack, and false above", () => {
    expect(isAtBottom({ scrollTop: 1000, clientHeight: 800, scrollHeight: 1800 })).toBe(true);
    expect(isAtBottom({ scrollTop: 998, clientHeight: 800, scrollHeight: 1800 })).toBe(true);
    expect(isAtBottom({ scrollTop: 950, clientHeight: 800, scrollHeight: 1800 })).toBe(false);
  });
});
