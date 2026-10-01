"use client";

import { useState, type FormEvent } from "react";
import { setUpTOTP, verifyTOTPSetup, updateMFAPreference } from "aws-amplify/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { siteConfig } from "@/config/site";
import { formatTotpKey } from "@/lib/auth-policy/ui";
import { useAuth } from "./AuthContext";

type Step =
  | { kind: "start" }
  | { kind: "verify"; secret: string; uri: string };

/**
 * Turns on two-step sign-in with an authenticator app (TOTP) for the
 * signed-in user: Cognito issues a key, the user adds it to their app and
 * confirms one code, and the app becomes their preferred second step.
 * Afterwards the session is refreshed so new tokens reflect it (the pre
 * token generation trigger restores groups once TOTP is on).
 */
export default function TwoStepSetup({
  onDone,
  afterEnable,
}: {
  onDone?: () => void;
  /** Replaces the default session refresh, e.g. to reload the whole app. */
  afterEnable?: () => Promise<void>;
}) {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const details = await setUpTOTP();
      const uri = details.getSetupUri(siteConfig.product.name, user?.email).toString();
      setStep({ kind: "verify", secret: details.sharedSecret, uri });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start setup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyTOTPSetup({ code: code.trim() });
      await updateMFAPreference({ totp: "PREFERRED" });
      if (afterEnable) await afterEnable();
      else await refreshUser({ forceRefresh: true });
      toast.success("Two-step sign-in is on");
      setStep({ kind: "start" });
      setCode("");
      onDone?.();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "EnableSoftwareTokenMFAException" || name === "CodeMismatchException"
          ? "That code did not match. Check the time on your phone and try the newest code."
          : err instanceof Error
            ? err.message
            : "Could not turn on two-step sign-in."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Key copied");
    } catch {
      toast.error("Copy did not work. Select the key and copy it.");
    }
  }

  if (step.kind === "start") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Set up an authenticator app
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground/80">
        <li>
          In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or
          similar), add an account and enter this key:
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="select-all rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider text-foreground">
              {formatTotpKey(step.secret)}
            </code>
            <button
              type="button"
              onClick={() => copyKey(step.secret)}
              className="rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              Copy key
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            On this phone? <a className="underline" href={step.uri}>Open it in your authenticator app</a>.
          </p>
        </li>
        <li>
          <label htmlFor="totp-setup-code">Enter the 6-digit code the app shows.</label>
          <input
            id="totp-setup-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 block w-40 rounded-lg border border-foreground/15 px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="123456"
          />
        </li>
      </ol>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Turn on two-step sign-in
        </button>
        <button
          type="button"
          onClick={() => {
            setStep({ kind: "start" });
            setCode("");
            setError("");
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
