import { describe, expect, it } from "vitest";
import { devicePixelRatioFor, spriteId, spriteIds } from "./sprites";

describe("sprite ids", () => {
  it("names an image owner.kind, with the variant after", () => {
    expect(spriteId("one", "POINT")).toBe("one.POINT");
    expect(spriteId("one", "POINT", "closed")).toBe("one.POINT.closed");
    expect(spriteIds([{ id: "a.b", svg: "<svg/>", size: 32 }, { id: "a.c.d", svg: "<svg/>", size: 32 }])).toEqual(["a.b", "a.c.d"]);
  });
});

describe("devicePixelRatioFor", () => {
  it("draws at 2x on a dense screen and 1x otherwise, never in between", () => {
    expect(devicePixelRatioFor({ devicePixelRatio: 3 })).toBe(2);
    expect(devicePixelRatioFor({ devicePixelRatio: 2 })).toBe(2);
    expect(devicePixelRatioFor({ devicePixelRatio: 1.5 })).toBe(2);
    expect(devicePixelRatioFor({ devicePixelRatio: 1 })).toBe(1);
    expect(devicePixelRatioFor(undefined)).toBe(1);
  });
});
