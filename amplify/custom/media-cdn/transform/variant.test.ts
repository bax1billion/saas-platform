import { describe, expect, it } from "vitest";

process.env.ORIGINALS_BUCKET ??= "originals-test";
process.env.TRANSFORMED_BUCKET ??= "transformed-test";

const { parseVariant } = await import("./handler");

describe("parseVariant", () => {
  it("accepts the canonical sorted ops the viewer function emits", () => {
    expect(parseVariant("f=webp,q=70,w=192")).toEqual({ f: "webp", q: 70, w: 192 });
    expect(parseVariant("h=640")).toEqual({ h: 640 });
    expect(parseVariant("original")).toEqual({});
  });

  it("rejects out-of-range dimensions and quality", () => {
    expect(parseVariant("w=0")).toBeNull();
    expect(parseVariant("w=4097")).toBeNull();
    expect(parseVariant("q=101")).toBeNull();
    expect(parseVariant("w=abc")).toBeNull();
    expect(parseVariant("w=1.5")).toBeNull();
  });

  it("rejects unknown formats and unknown ops", () => {
    expect(parseVariant("f=bmp")).toBeNull();
    expect(parseVariant("f=auto")).toBeNull(); // auto is resolved at the edge
    expect(parseVariant("x=1")).toBeNull();
    expect(parseVariant("")).toBeNull();
  });
});
