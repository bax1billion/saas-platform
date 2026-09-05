import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signPrefixAccess } from "./handler";

process.env.GRAPHQL_ENDPOINT ??= "https://example.invalid/graphql";
process.env.AWS_REGION ??= "us-east-1";

let privateKey: string;
beforeAll(() => {
  privateKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
});

const cfg = () => ({
  domain: "d123.cloudfront.net",
  keyPairId: "KTEST123",
  privateKey,
  ttlSeconds: 900,
});

/** CloudFront's base64 variant: + → -, = → _, / → ~ (decode reverses). */
function decodePolicy(params: string): {
  Statement: Array<{
    Resource: string;
    Condition: { DateLessThan: { "AWS:EpochTime": number } };
  }>;
} {
  const encoded = /Policy=([^&]+)/.exec(params)![1];
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString());
}

describe("signPrefixAccess", () => {
  it("returns Policy/Signature/Key-Pair-Id query params", () => {
    const a = signPrefixAccess("uploads/case-1/", cfg());
    expect(a.params).toMatch(/Policy=/);
    expect(a.params).toMatch(/Signature=/);
    expect(a.params).toContain("Key-Pair-Id=KTEST123");
    expect(a.domain).toBe("d123.cloudfront.net");
  });

  it("signs a wildcard custom policy scoped to the prefix", () => {
    const a = signPrefixAccess("uploads/case-1/", cfg());
    const policy = decodePolicy(a.params);
    expect(policy.Statement[0].Resource).toBe(
      "https://d123.cloudfront.net/uploads/case-1/*"
    );
  });

  it("expires in the future, matching the policy epoch", () => {
    const before = Date.now();
    const a = signPrefixAccess("uploads/case-1/", cfg());
    const policy = decodePolicy(a.params);
    const epochMs = policy.Statement[0].Condition.DateLessThan["AWS:EpochTime"] * 1000;
    expect(new Date(a.expiresAt).getTime()).toBe(epochMs);
    expect(epochMs).toBeGreaterThan(before);
    expect(epochMs).toBeLessThanOrEqual(before + 901_000);
  });

  it("different prefixes produce different signatures", () => {
    const a = signPrefixAccess("uploads/case-1/", cfg());
    const b = signPrefixAccess("uploads/case-2/", cfg());
    expect(/Signature=([^&]+)/.exec(a.params)![1]).not.toBe(
      /Signature=([^&]+)/.exec(b.params)![1]
    );
  });
});
