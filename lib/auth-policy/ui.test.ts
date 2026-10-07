import { describe, expect, it } from "vitest";
import { describePolicy, formatTotpKey, samePolicy, toggleMethod } from "./ui";

describe("formatTotpKey", () => {
  it("groups the key in fours", () => {
    expect(formatTotpKey("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(formatTotpKey("ABCDE")).toBe("ABCD E");
  });
});

describe("toggleMethod", () => {
  it("adds in display order and removes", () => {
    expect(toggleMethod(["microsoft"], "password", true)).toEqual(["password", "microsoft"]);
    expect(toggleMethod(["password", "google"], "google", false)).toEqual(["password"]);
    expect(toggleMethod(["password"], "password", true)).toEqual(["password"]);
  });
});

describe("samePolicy", () => {
  it("ignores method order", () => {
    expect(
      samePolicy(
        { signInMethods: ["google", "password"], mfaPolicy: "OFF" },
        { signInMethods: ["password", "google"], mfaPolicy: "OFF" }
      )
    ).toBe(true);
    expect(
      samePolicy(
        { signInMethods: ["password"], mfaPolicy: "OFF" },
        { signInMethods: ["password"], mfaPolicy: "REQUIRED" }
      )
    ).toBe(false);
  });
});

describe("describePolicy", () => {
  it("summarizes a policy", () => {
    expect(describePolicy({ signInMethods: ["password", "microsoft"], mfaPolicy: "OPTIONAL" })).toBe(
      "Email and password, Microsoft. Two-step: Optional."
    );
  });
});
