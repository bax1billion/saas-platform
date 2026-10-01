/**
 * Organization sign-in policy: which sign-in methods an organization allows
 * and whether it asks for two-step sign-in (TOTP). Pure and dependency-free
 * so the browser, the policy command Lambda and the Cognito pre token
 * generation trigger all make the same decision (docs/sign-in-and-mfa.md).
 *
 * Client code imports it as `@/lib/auth-policy`; backend code by relative path.
 */

/** Built-in sign-in methods. A federated provider's method id is its
 *  Cognito provider name, lower-cased, so an organization's own SAML or
 *  OIDC provider added later ("Acme-Entra") becomes "acme-entra" without a
 *  schema change. */
export const PASSWORD = "password";
export const GOOGLE = "google";
export const MICROSOFT = "microsoft";

/** Federated providers this codebase knows how to configure, with the
 *  Cognito provider name each one is registered under. */
export const FEDERATED_PROVIDERS = [
  { id: GOOGLE, providerName: "Google", label: "Google" },
  { id: MICROSOFT, providerName: "Microsoft", label: "Microsoft" },
] as const;

export type SignInMethod = string;

export const MFA_POLICIES = ["OFF", "OPTIONAL", "REQUIRED"] as const;
export type MfaPolicy = (typeof MFA_POLICIES)[number];

export type AuthPolicy = {
  /** Allowed methods, in display order. Never empty once normalized. */
  signInMethods: SignInMethod[];
  mfaPolicy: MfaPolicy;
};

/** What an organization gets until an Admin changes it: every method this
 *  environment has set up, and two-step sign-in offered but not required. */
export const RECOMMENDED_MFA_POLICY: MfaPolicy = "OPTIONAL";

export function recommendedAuthPolicy(configured: readonly SignInMethod[]): AuthPolicy {
  return { signInMethods: orderMethods(configured), mfaPolicy: RECOMMENDED_MFA_POLICY };
}

export function methodLabel(method: SignInMethod): string {
  if (method === PASSWORD) return "Email and password";
  const known = FEDERATED_PROVIDERS.find((p) => p.id === method);
  return known ? known.label : method;
}

/** Password first, then the known providers, then anything else A to Z. */
export function orderMethods(methods: readonly SignInMethod[]): SignInMethod[] {
  const rank = (m: SignInMethod) => {
    if (m === PASSWORD) return 0;
    const i = FEDERATED_PROVIDERS.findIndex((p) => p.id === m);
    return i === -1 ? 100 : i + 1;
  };
  return [...new Set(methods)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The sign-in methods an environment offers, from the comma-separated
 * `AUTH_FEDERATED_PROVIDERS` value the backend is built with. Password is
 * always on (the user pool signs in with email). Unknown ids are dropped.
 */
export function configuredMethodsFromEnv(value: string | undefined | null): SignInMethod[] {
  const ids = (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => FEDERATED_PROVIDERS.some((p) => p.id === s));
  return orderMethods([PASSWORD, ...ids]);
}

/**
 * The same list on the client, from `amplify_outputs.json`
 * (`auth.oauth.identity_providers`, e.g. ["GOOGLE", "Microsoft"]).
 */
export function configuredMethodsFromOutputs(outputs: unknown): SignInMethod[] {
  const providers = (outputs as { auth?: { oauth?: { identity_providers?: unknown } } } | null)?.auth
    ?.oauth?.identity_providers;
  const names = Array.isArray(providers) ? providers.filter((p): p is string => typeof p === "string") : [];
  return orderMethods([PASSWORD, ...names.map((n) => n.toLowerCase())]);
}

/** The Cognito provider name to pass to signInWithRedirect for a method. */
export function providerNameFor(method: SignInMethod): string | null {
  if (method === PASSWORD) return null;
  const known = FEDERATED_PROVIDERS.find((p) => p.id === method);
  return known ? known.providerName : method;
}

/**
 * Which method a Cognito user signed in with. Federated users carry an
 * `identities` attribute (JSON) and a username of `<Provider>_<id>`;
 * everyone else used email and password. `knownFederated` is the list of
 * configured federated method ids, used for the username fallback.
 */
export function signInMethodFor(
  username: string | null | undefined,
  identities: string | null | undefined,
  knownFederated: readonly SignInMethod[] = FEDERATED_PROVIDERS.map((p) => p.id)
): SignInMethod {
  if (identities) {
    try {
      const parsed: unknown = JSON.parse(identities);
      const first = Array.isArray(parsed) ? parsed[0] : null;
      const name = first && typeof first === "object" ? (first as { providerName?: unknown }).providerName : null;
      if (typeof name === "string" && name) return name.toLowerCase();
    } catch {
      // fall through to the username
    }
  }
  const lower = (username ?? "").toLowerCase();
  const match = knownFederated.find((id) => id !== PASSWORD && lower.startsWith(`${id}_`));
  return match ?? PASSWORD;
}

export type StoredAuthPolicy = {
  signInMethods?: readonly (string | null)[] | null;
  mfaPolicy?: string | null;
};

/**
 * The policy that is actually applied. Fails safe: a missing policy is the
 * recommended one, methods this environment does not offer are ignored,
 * and if nothing usable is left, password sign-in stays on so an
 * organization can never be locked out by a provider being removed.
 */
export function normalizeAuthPolicy(
  stored: StoredAuthPolicy | null | undefined,
  configured: readonly SignInMethod[]
): AuthPolicy {
  const recommended = recommendedAuthPolicy(configured);
  const mfaPolicy = MFA_POLICIES.includes(stored?.mfaPolicy as MfaPolicy)
    ? (stored!.mfaPolicy as MfaPolicy)
    : recommended.mfaPolicy;
  if (!stored?.signInMethods || stored.signInMethods.length === 0) {
    return { signInMethods: recommended.signInMethods, mfaPolicy };
  }
  const usable = orderMethods(
    stored.signInMethods.filter((m): m is string => typeof m === "string" && configured.includes(m))
  );
  return { signInMethods: usable.length ? usable : [PASSWORD], mfaPolicy };
}

export type PolicyValidation =
  | { ok: true; policy: AuthPolicy }
  | { ok: false; errors: string[] };

/**
 * Validates an Admin's change before it is saved. `callerMethod` is how
 * the Admin saving it signed in: turning that method off would end their
 * own access, so it is refused.
 */
export function validateAuthPolicy(
  input: { signInMethods?: unknown; mfaPolicy?: unknown },
  configured: readonly SignInMethod[],
  callerMethod: SignInMethod
): PolicyValidation {
  const errors: string[] = [];
  const raw = Array.isArray(input.signInMethods) ? input.signInMethods : null;
  if (!raw || raw.length === 0) {
    errors.push("Choose at least one sign-in method.");
  }
  const methods: string[] = [];
  for (const m of raw ?? []) {
    if (typeof m !== "string" || !configured.includes(m)) {
      errors.push(`"${String(m)}" is not a sign-in method this environment offers.`);
    } else if (!methods.includes(m)) {
      methods.push(m);
    }
  }
  const mfaPolicy = input.mfaPolicy;
  if (!MFA_POLICIES.includes(mfaPolicy as MfaPolicy)) {
    errors.push("Two-step sign-in must be Off, Optional or Required.");
  }
  if (methods.length > 0 && !methods.includes(callerMethod)) {
    errors.push(
      `You signed in with ${methodLabel(callerMethod)}. Keep it on, or sign in another allowed way before turning it off.`
    );
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: { signInMethods: orderMethods(methods), mfaPolicy: mfaPolicy as MfaPolicy } };
}

export type TokenDecision =
  | { kind: "allow" }
  /** Signed in, but must set up two-step sign-in before any data access. */
  | { kind: "enroll" }
  | { kind: "deny"; message: string };

/**
 * The pre token generation decision. Two-step sign-in is enforced by
 * Cognito for password sign-ins only; a federated sign-in relies on the
 * provider's own two-step policy (Cognito does not challenge it).
 */
export function decideTokenIssue(args: {
  method: SignInMethod;
  policy: AuthPolicy;
  totpEnrolled: boolean;
}): TokenDecision {
  const { method, policy, totpEnrolled } = args;
  if (!policy.signInMethods.includes(method)) {
    const allowed = policy.signInMethods.map(methodLabel).join(" or ");
    return {
      kind: "deny",
      message: `Your organization does not allow signing in with ${methodLabel(method)}. Sign in with ${allowed}.`,
    };
  }
  if (policy.mfaPolicy === "REQUIRED" && method === PASSWORD && !totpEnrolled) {
    return { kind: "enroll" };
  }
  return { kind: "allow" };
}

/** ID token claim the trigger sets when the user must enroll first. */
export const MFA_SETUP_CLAIM = "mfa_setup_required";

/**
 * ID token claim the trigger sets when it could not read the sign-in policy
 * (a table or Cognito call failed). Those tokens carry no groups, so every
 * data rule denies them; the next sign-in or token refresh checks again.
 */
export const AUTH_CHECK_UNAVAILABLE_CLAIM = "auth_check_unavailable";

/** What the app shows a person holding such a token. */
export const AUTH_CHECK_UNAVAILABLE_MESSAGE = "We couldn't verify your sign-in. Please try again.";

/**
 * Cognito wraps a trigger's error as "PreTokenGeneration failed with error
 * <message>." Returns the message for the person, or null when the error
 * is not one of ours.
 */
export function policyErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const decoded = raw.replace(/\+/g, " ");
  const m = /PreTokenGeneration failed with error ([\s\S]+?)\.?\s*$/.exec(decoded);
  return m ? m[1].trim().replace(/\.$/, "") + "." : null;
}
