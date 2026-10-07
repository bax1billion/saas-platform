import { describe, expect, it } from "vitest";
import {
  GOOGLE,
  MICROSOFT,
  PASSWORD,
  configuredMethodsFromEnv,
  configuredMethodsFromOutputs,
  decideTokenIssue,
  normalizeAuthPolicy,
  orderMethods,
  policyErrorMessage,
  providerNameFor,
  recommendedAuthPolicy,
  signInMethodFor,
  validateAuthPolicy,
} from "./index";

const ALL = [PASSWORD, GOOGLE, MICROSOFT];

describe("configured methods", () => {
  it("always offers password and keeps only known providers", () => {
    expect(configuredMethodsFromEnv(undefined)).toEqual([PASSWORD]);
    expect(configuredMethodsFromEnv("")).toEqual([PASSWORD]);
    expect(configuredMethodsFromEnv(" Microsoft, google ,okta")).toEqual(ALL);
  });

  it("reads amplify_outputs identity providers", () => {
    expect(configuredMethodsFromOutputs({})).toEqual([PASSWORD]);
    expect(configuredMethodsFromOutputs(null)).toEqual([PASSWORD]);
    expect(
      configuredMethodsFromOutputs({ auth: { oauth: { identity_providers: ["GOOGLE", "Microsoft"] } } })
    ).toEqual(ALL);
  });

  it("orders password, then known providers, then the rest", () => {
    expect(orderMethods(["zeta-saml", MICROSOFT, PASSWORD, GOOGLE, GOOGLE])).toEqual([
      PASSWORD,
      GOOGLE,
      MICROSOFT,
      "zeta-saml",
    ]);
  });

  it("maps methods to Cognito provider names", () => {
    expect(providerNameFor(PASSWORD)).toBeNull();
    expect(providerNameFor(GOOGLE)).toBe("Google");
    expect(providerNameFor(MICROSOFT)).toBe("Microsoft");
  });
});

describe("signInMethodFor", () => {
  it("reads the provider from the identities attribute", () => {
    expect(signInMethodFor("Google_123", JSON.stringify([{ providerName: "Google" }]))).toBe(GOOGLE);
    expect(signInMethodFor("x", JSON.stringify([{ providerName: "Acme-Entra" }]))).toBe("acme-entra");
  });

  it("falls back to the username prefix", () => {
    expect(signInMethodFor("microsoft_abc", null)).toBe(MICROSOFT);
    expect(signInMethodFor("Google_1", "not json")).toBe(GOOGLE);
  });

  it("treats a native username as password", () => {
    expect(signInMethodFor("4f9e2c1a-0000-4000-8000-000000000000", undefined)).toBe(PASSWORD);
    expect(signInMethodFor(null, null)).toBe(PASSWORD);
  });
});

describe("normalizeAuthPolicy", () => {
  it("uses the recommended default when nothing is stored", () => {
    expect(normalizeAuthPolicy(null, ALL)).toEqual(recommendedAuthPolicy(ALL));
    expect(normalizeAuthPolicy({ signInMethods: [], mfaPolicy: null }, ALL)).toEqual({
      signInMethods: ALL,
      mfaPolicy: "OPTIONAL",
    });
  });

  it("drops methods this environment does not offer", () => {
    expect(normalizeAuthPolicy({ signInMethods: [MICROSOFT, PASSWORD], mfaPolicy: "REQUIRED" }, [PASSWORD])).toEqual({
      signInMethods: [PASSWORD],
      mfaPolicy: "REQUIRED",
    });
  });

  it("keeps password on rather than locking everyone out", () => {
    expect(normalizeAuthPolicy({ signInMethods: [MICROSOFT] }, [PASSWORD, GOOGLE]).signInMethods).toEqual([PASSWORD]);
  });

  it("replaces an unknown MFA value with the default", () => {
    expect(normalizeAuthPolicy({ signInMethods: [PASSWORD], mfaPolicy: "SOMETIMES" }, ALL).mfaPolicy).toBe("OPTIONAL");
  });
});

describe("validateAuthPolicy", () => {
  it("accepts a valid change and orders it", () => {
    expect(validateAuthPolicy({ signInMethods: [MICROSOFT, PASSWORD], mfaPolicy: "REQUIRED" }, ALL, PASSWORD)).toEqual({
      ok: true,
      policy: { signInMethods: [PASSWORD, MICROSOFT], mfaPolicy: "REQUIRED" },
    });
  });

  it("refuses an empty method list", () => {
    const r = validateAuthPolicy({ signInMethods: [], mfaPolicy: "OPTIONAL" }, ALL, PASSWORD);
    expect(r.ok).toBe(false);
  });

  it("refuses a method the environment does not offer", () => {
    const r = validateAuthPolicy({ signInMethods: [PASSWORD, GOOGLE], mfaPolicy: "OFF" }, [PASSWORD], PASSWORD);
    expect(r).toEqual({ ok: false, errors: ['"google" is not a sign-in method this environment offers.'] });
  });

  it("refuses an unknown MFA policy", () => {
    const r = validateAuthPolicy({ signInMethods: [PASSWORD], mfaPolicy: "ALWAYS" }, ALL, PASSWORD);
    expect(r.ok).toBe(false);
  });

  it("refuses turning off the method the Admin is signed in with", () => {
    const r = validateAuthPolicy({ signInMethods: [PASSWORD], mfaPolicy: "OPTIONAL" }, ALL, GOOGLE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/You signed in with Google/);
  });

  it("refuses a non-array method list", () => {
    expect(validateAuthPolicy({ signInMethods: "password", mfaPolicy: "OFF" }, ALL, PASSWORD).ok).toBe(false);
  });
});

describe("decideTokenIssue", () => {
  const policy = { signInMethods: [PASSWORD, MICROSOFT], mfaPolicy: "OPTIONAL" as const };

  it("allows an allowed method", () => {
    expect(decideTokenIssue({ method: PASSWORD, policy, totpEnrolled: false })).toEqual({ kind: "allow" });
  });

  it("denies a method the organization turned off", () => {
    const d = decideTokenIssue({ method: GOOGLE, policy, totpEnrolled: false });
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.message).toBe(
      "Your organization does not allow signing in with Google. Sign in with Email and password or Microsoft."
    );
  });

  it("sends a password user without TOTP to enrollment when required", () => {
    const required = { ...policy, mfaPolicy: "REQUIRED" as const };
    expect(decideTokenIssue({ method: PASSWORD, policy: required, totpEnrolled: false })).toEqual({ kind: "enroll" });
    expect(decideTokenIssue({ method: PASSWORD, policy: required, totpEnrolled: true })).toEqual({ kind: "allow" });
  });

  it("leaves two-step to the provider for a federated sign-in", () => {
    const required = { ...policy, mfaPolicy: "REQUIRED" as const };
    expect(decideTokenIssue({ method: MICROSOFT, policy: required, totpEnrolled: false })).toEqual({ kind: "allow" });
  });
});

describe("policyErrorMessage", () => {
  it("unwraps Cognito's trigger error", () => {
    expect(
      policyErrorMessage(
        "PreTokenGeneration failed with error Your organization does not allow signing in with Google. Sign in with Microsoft.."
      )
    ).toBe("Your organization does not allow signing in with Google. Sign in with Microsoft.");
  });

  it("handles the form-encoded redirect description", () => {
    expect(policyErrorMessage("PreTokenGeneration+failed+with+error+Not+allowed.+")).toBe("Not allowed.");
  });

  it("ignores other errors", () => {
    expect(policyErrorMessage("Incorrect username or password.")).toBeNull();
    expect(policyErrorMessage(undefined)).toBeNull();
  });
});
