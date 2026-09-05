import { describe, expect, it } from "vitest";
import { buildVariantUrl, type MediaAccess } from "./media-cdn";

const access: MediaAccess = {
  enabled: true,
  domain: "d123.cloudfront.net",
  params: "Policy=P&Signature=S&Key-Pair-Id=K",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("buildVariantUrl", () => {
  it("appends auth params then variant params", () => {
    expect(buildVariantUrl(access, "uploads/c1/a.jpg", { w: 192, f: "auto" })).toBe(
      "https://d123.cloudfront.net/uploads/c1/a.jpg?Policy=P&Signature=S&Key-Pair-Id=K&w=192&f=auto"
    );
  });

  it("omits the variant suffix when no options given", () => {
    expect(buildVariantUrl(access, "uploads/c1/a.jpg")).toBe(
      "https://d123.cloudfront.net/uploads/c1/a.jpg?Policy=P&Signature=S&Key-Pair-Id=K"
    );
  });

  it("percent-encodes path segments but not slashes", () => {
    expect(buildVariantUrl(access, "uploads/c1/my photo.jpg")).toContain(
      "/uploads/c1/my%20photo.jpg?"
    );
  });

  it("returns null when access is disabled or incomplete", () => {
    expect(buildVariantUrl({ enabled: false }, "k")).toBeNull();
    expect(buildVariantUrl({ enabled: true, domain: "d" }, "k")).toBeNull();
  });
});
