"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import outputs from "@/amplify_outputs.json";
import { getDataClient } from "@/lib/data-client";
import { isOrgAdmin } from "@/lib/roles";
import {
  MFA_POLICIES,
  configuredMethodsFromOutputs,
  methodLabel,
  normalizeAuthPolicy,
  recommendedAuthPolicy,
  validateAuthPolicy,
  type AuthPolicy,
} from "@/lib/auth-policy";
import { MFA_POLICY_COPY, samePolicy, toggleMethod } from "@/lib/auth-policy/ui";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";

/**
 * Org Admin only: how people in this organization may sign in, and whether
 * two-step sign-in is off, optional or required. Starts from the
 * recommended setup (every method this environment offers, two-step
 * optional). Saved through the `setOrgAuthPolicy` command, which checks the
 * same rules on the server; the pre token generation trigger applies it at
 * every sign-in and token refresh (docs/sign-in-and-mfa.md).
 */
export default function SignInPolicyCard() {
  const { user } = useAuth();
  const { org, refresh } = useEntitlements();
  const [draft, setDraft] = useState<AuthPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  /** Inline confirmation after a save; the saved values are the state. */
  const [saved, setSaved] = useState<string | null>(null);

  if (!user || !org || !isOrgAdmin(user.groups)) return null;

  const configured = configuredMethodsFromOutputs(outputs);
  const current = normalizeAuthPolicy(org, configured);
  const recommended = recommendedAuthPolicy(configured);
  const value = draft ?? current;
  const dirty = !samePolicy(value, current);

  const update = (next: AuthPolicy) => {
    setErrors([]);
    setSaved(null);
    setDraft(next);
  };

  async function save() {
    const check = validateAuthPolicy(value, configured, user!.signInMethod);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setSaving(true);
    try {
      const { errors: gqlErrors } = await getDataClient().mutations.setOrgAuthPolicy({
        signInMethods: check.policy.signInMethods,
        mfaPolicy: check.policy.mfaPolicy,
      });
      if (gqlErrors?.length) {
        setErrors(gqlErrors.map((e) => e.message));
        return;
      }
      await refresh();
      setDraft(null);
      setSaved("Saved. It applies at each person's next sign-in, or within the hour.");
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Could not save the sign-in settings."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-background p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground">Sign-in and security</h2>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose how people in {org.name} sign in. The recommended setup allows every method below with
        two-step sign-in optional.
      </p>

      <fieldset className="mt-5">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sign-in methods
        </legend>
        <div className="mt-2 space-y-2">
          {configured.map((m) => {
            const id = `signin-method-${m}`;
            const checked = value.signInMethods.includes(m);
            return (
              <label key={m} htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(e) =>
                    update({ ...value, signInMethods: toggleMethod(value.signInMethods, m, e.target.checked) })
                  }
                />
                {methodLabel(m)}
                {m === user.signInMethod && (
                  <span className="text-xs text-muted-foreground">(how you signed in)</span>
                )}
              </label>
            );
          })}
        </div>
        {configured.length === 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Google and Microsoft sign-in are not set up in this environment yet.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Signing in with Google or Microsoft creates its own account. Someone who already has a password
          account keeps using it until accounts can be linked.
        </p>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Two-step sign-in (authenticator app)
        </legend>
        <div className="mt-2 space-y-3">
          {MFA_POLICIES.map((p) => {
            const id = `mfa-policy-${p}`;
            return (
              <label key={p} htmlFor={id} className="flex items-start gap-2 text-sm text-foreground">
                <input
                  id={id}
                  type="radio"
                  name="mfa-policy"
                  className="mt-1"
                  checked={value.mfaPolicy === p}
                  disabled={saving}
                  onChange={() => update({ ...value, mfaPolicy: p })}
                />
                <span>
                  <span className="font-medium">{MFA_POLICY_COPY[p].label}</span>
                  <span className="block text-xs text-muted-foreground">{MFA_POLICY_COPY[p].detail}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="mt-4 space-y-1 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {saved && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {saved}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          Save
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setErrors([]);
              setSaved(null);
            }}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        )}
        {!samePolicy(value, recommended) && (
          <button
            type="button"
            onClick={() => update(recommended)}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Use the recommended setup
          </button>
        )}
      </div>
    </section>
  );
}
