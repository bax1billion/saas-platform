/**
 * Small pure helpers behind the sign-in settings screens, kept out of the
 * components so they are unit-tested.
 */
import { MFA_POLICIES, methodLabel, orderMethods, type AuthPolicy, type MfaPolicy } from "./index";

/** "JBSWY3DPEHPK3PXP" becomes "JBSW Y3DP EHPK 3PXP", easier to type. */
export function formatTotpKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Turn one method on or off in a draft list, keeping display order. */
export function toggleMethod(methods: readonly string[], method: string, on: boolean): string[] {
  const without = methods.filter((m) => m !== method);
  return orderMethods(on ? [...without, method] : without);
}

export function samePolicy(a: AuthPolicy, b: AuthPolicy): boolean {
  return (
    a.mfaPolicy === b.mfaPolicy &&
    orderMethods(a.signInMethods).join(",") === orderMethods(b.signInMethods).join(",")
  );
}

export const MFA_POLICY_COPY: Record<MfaPolicy, { label: string; detail: string }> = {
  OFF: {
    label: "Off",
    detail: "Nobody is asked to set it up. People who already turned it on keep using it.",
  },
  OPTIONAL: {
    label: "Optional (recommended)",
    detail: "Anyone can turn it on for their own account from this page.",
  },
  REQUIRED: {
    label: "Required",
    detail:
      "Everyone who signs in with email and password must set up an authenticator app before they can open anything. Google and Microsoft sign-ins use that provider's own two-step settings.",
  },
};

/** One line for the settings page, e.g. "Email and password, Microsoft. Two-step: Required." */
export function describePolicy(policy: AuthPolicy): string {
  const methods = policy.signInMethods.map(methodLabel).join(", ");
  return `${methods}. Two-step: ${MFA_POLICY_COPY[policy.mfaPolicy].label.replace(" (recommended)", "")}.`;
}

export { MFA_POLICIES };
