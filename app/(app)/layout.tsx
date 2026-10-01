"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/app/components/AuthContext";
import EntitlementsProvider, {
  useEntitlements,
} from "@/app/components/EntitlementsContext";
import AppShell from "@/app/components/AppShell";
import AuthModal from "@/app/components/AuthModal";
import TwoStepSetup from "@/app/components/TwoStepSetup";
import { siteConfig } from "@/config/site";
import { AUTH_CHECK_UNAVAILABLE_MESSAGE } from "@/lib/auth-policy";

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function SignInPrompt() {
  const { openAuthModal } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Sign in to {siteConfig.product.name}
        </h1>
        <p className="mt-2 text-foreground/60">
          You need to be signed in to open the app.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => openAuthModal("signIn")}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-background"
          >
            Home
          </Link>
        </div>
      </div>
      <AuthModal />
    </div>
  );
}

/**
 * The organization requires two-step sign-in and this person has not set
 * it up. Their token carries no groups until they do, so nothing else in
 * the app can load; setup refreshes the session and the gate lets them in.
 */
function TwoStepRequired() {
  const { handleSignOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="w-full max-w-md rounded-2xl bg-background p-8 shadow-sm">
        <h1 className="font-serif text-2xl font-bold text-foreground">Set up two-step sign-in</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Your organization asks everyone to use a code from an authenticator app when they sign in to{" "}
          {siteConfig.product.name}. It takes about a minute.
        </p>
        <div className="mt-6">
          {/* New tokens carry the groups again. Reload so every provider
              starts from them, not from records it could not read. */}
          <TwoStepSetup
            afterEnable={async () => {
              await fetchAuthSession({ forceRefresh: true });
              window.location.reload();
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-6 text-sm text-foreground/50 hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * The sign-in policy check could not run (its lookups failed), so this
 * token carries no groups and nothing can load. Retrying gets new tokens,
 * which runs the check again; a reload lets every provider start from them.
 */
function SignInCheckUnavailable() {
  const { handleSignOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await fetchAuthSession({ forceRefresh: true });
    } catch {
      // the reload below shows this screen again if it still fails
    }
    window.location.reload();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="w-full max-w-md rounded-2xl bg-background p-8 text-center shadow-sm">
        <p className="text-foreground">{AUTH_CHECK_UNAVAILABLE_MESSAGE}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {retrying ? "Trying again..." : "Try again"}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-background"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Gate for the (app) route group — see docs/subscriptions-and-payments.md
 * §3. Auth → retry screen if the sign-in policy check could not run →
 * two-step setup if the org requires it → onboarding → shell.
 * Subscription state is surfaced in the shell (banner, dashboard card)
 * rather than hard-blocking here: reads stay
 * available after lapse, and module access is decided per module by
 * ModuleShell from resolved entitlements.
 */
function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { isLoading, needsOnboarding } = useEntitlements();
  const mfaSetupRequired = user?.mfaSetupRequired ?? false;
  const authCheckUnavailable = user?.authCheckUnavailable ?? false;
  const groupless = mfaSetupRequired || authCheckUnavailable;

  useEffect(() => {
    // A token without groups cannot read the User row, which would look
    // like "no org yet": never send that person to onboarding.
    if (!isLoading && isAuthenticated && needsOnboarding && !groupless) {
      router.replace("/onboarding");
    }
  }, [isLoading, isAuthenticated, needsOnboarding, groupless, router]);

  if (authLoading) return <Spinner />;
  if (!isAuthenticated) return <SignInPrompt />;
  if (authCheckUnavailable) return <SignInCheckUnavailable />;
  if (mfaSetupRequired) return <TwoStepRequired />;
  if (isLoading || needsOnboarding) return <Spinner />;

  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <EntitlementsProvider>
      <AppGate>{children}</AppGate>
    </EntitlementsProvider>
  );
}
