import { describe, expect, it } from "vitest";

process.env.GRAPHQL_ENDPOINT ??= "https://example.invalid/graphql";
process.env.USER_POOL_ID ??= "pool-test";
process.env.AWS_REGION ??= "us-east-1";

const { slugify } = await import("./handler");

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Maple Valley Fire District")).toBe(
      "maple-valley-fire-district"
    );
  });
  it("strips punctuation and diacritics", () => {
    expect(slugify("St. Jörg's #1 Dept!")).toBe("st-jo-rg-s-1-dept");
  });
  it("trims leading/trailing separators and caps length at 48", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
    expect(slugify("x".repeat(80))).toHaveLength(48);
  });
  it("falls back to 'org' when nothing survives", () => {
    expect(slugify("!!!")).toBe("org");
  });
});
