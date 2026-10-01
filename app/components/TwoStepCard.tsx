"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchMFAPreference, updateMFAPreference } from "aws-amplify/auth";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import outputs from "@/amplify_outputs.json";
import { PASSWORD, configuredMethodsFromOutputs, methodLabel, normalizeAuthPolicy } from "@/lib/auth-policy";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";
import TwoStepSetup from "./TwoStepSetup";

/**
 * The signed-in person's own two-step sign-in (authenticator app), on the
 * settings page. Follows the organization's policy: hidden when it is Off
 * for someone who has not turned it on, and it cannot be turned off when
 * the organization requires it.
 */
export default function TwoStepCard() {
  const { user, refreshUser } = useAuth();
  const { org } = useEntitlements();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const isPassword = user?.signInMethod === PASSWORD;

  useEffect(() => {
    if (!isPassword) return;
    let cancelled = false;
    fetchMFAPreference()
      .then((p) => {
        if (!cancelled) setEnabled((p.enabled ?? []).includes("TOTP"));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPassword]);

  if (!user || !org) return null;
  const policy = normalizeAuthPolicy(org, configuredMethodsFromOutputs(outputs));

  if (!isPassword) {
    return (
      <Section>
        <p className="mt-2 text-sm text-muted-foreground">
          You sign in with {methodLabel(user.signInMethod)}, so two-step sign-in is set in your{" "}
          {methodLabel(user.signInMethod)} account.
        </p>
      </Section>
    );
  }
  if (enabled === null) return null;
  if (!enabled && policy.mfaPolicy === "OFF") return null;

  async function turnOff() {
    setBusy(true);
    try {
      await updateMFAPreference({ totp: "DISABLED" });
      await refreshUser({ forceRefresh: true });
      setEnabled(false);
      toast.success("Two-step sign-in is off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn it off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section>
      {enabled ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm text-foreground">On. You enter a code from your authenticator app when you sign in.</p>
          {policy.mfaPolicy === "REQUIRED" ? (
            <p className="text-sm text-muted-foreground">Your organization requires it.</p>
          ) : (
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Turn off
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Add a code from an authenticator app to your password, so a stolen password alone cannot open your
            account.
          </p>
          <TwoStepSetup onDone={() => setEnabled(true)} />
        </div>
      )}
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-background p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground">Two-step sign-in</h2>
      </div>
      {children}
    </section>
  );
}
