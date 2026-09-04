import { describe, expect, it } from "vitest";
import { parseJsonField, toJsonField } from "./json";

describe("parseJsonField", () => {
  it("parses a JSON string (AWSJSON wire format)", () => {
    expect(parseJsonField('{"a":1}', {})).toEqual({ a: 1 });
  });
  it("passes through an already-parsed object", () => {
    expect(parseJsonField({ a: 1 }, {})).toEqual({ a: 1 });
  });
  it("falls back on null/undefined/invalid JSON", () => {
    expect(parseJsonField(null, "fb")).toBe("fb");
    expect(parseJsonField(undefined, "fb")).toBe("fb");
    expect(parseJsonField("{nope", "fb")).toBe("fb");
  });
  it("round-trips with toJsonField", () => {
    const value = { modules: ["a"], access: "comped" };
    expect(parseJsonField(toJsonField(value), {})).toEqual(value);
  });
});
