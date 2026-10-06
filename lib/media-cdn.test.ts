import { describe, expect, it } from "vitest";
import { buildOriginalUrl, buildVariantUrl, type MediaAccess } from "./media-cdn";

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

  it("open mode (empty params) yields an unsigned CDN URL, never S3", () => {
    const open: MediaAccess = { enabled: true, domain: "d123.cloudfront.net", params: "", expiresAt: null };
    expect(buildVariantUrl(open, "uploads/c1/a.jpg", { w: 192 })).toBe("https://d123.cloudfront.net/uploads/c1/a.jpg?w=192");
    expect(buildVariantUrl(open, "uploads/c1/a.jpg")).toBe("https://d123.cloudfront.net/uploads/c1/a.jpg");
  });
});

describe("buildOriginalUrl", () => {
  it("inserts the /original/ marker after the entity segment and keeps the case grant", () => {
    expect(buildOriginalUrl(access, "uploads/c1/abc-IMG_0431.MOV")).toBe(
      "https://d123.cloudfront.net/uploads/c1/original/abc-IMG_0431.MOV?Policy=P&Signature=S&Key-Pair-Id=K"
    );
  });
  it("stays under the signed prefix so the wildcard policy matches", () => {
    const url = buildOriginalUrl(access, "uploads/c1/a b.mp4")!;
    expect(url.startsWith("https://d123.cloudfront.net/uploads/c1/")).toBe(true);
    expect(url).toContain("/original/a%20b.mp4?");
  });
  it("returns null for malformed keys or disabled access", () => {
    expect(buildOriginalUrl(access, "uploads/c1")).toBeNull();
    expect(buildOriginalUrl({ enabled: false }, "uploads/c1/a.jpg")).toBeNull();
  });
});
