"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import EntitlementsProvider, {
  useEntitlements,
} from "@/app/components/EntitlementsContext";
import AppShell from "@/app/components/AppShell";
import AuthModal from "@/app/components/AuthModal";
import { siteConfig } from "@/config/site";

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
 * Gate for the (app) route group — see docs/subscriptions-and-payments.md
 * §3. Auth → onboarding → shell. Subscription state is surfaced in the
 * shell (banner, dashboard card) rather than hard-blocking here: reads stay
 * available after lapse, and module access is decided per module by
 * ModuleShell from resolved entitlements.
 */
function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isLoading, needsOnboarding } = useEntitlements();

  useEffect(() => {
    if (!isLoading && isAuthenticated && needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [isLoading, isAuthenticated, needsOnboarding, router]);

  if (authLoading) return <Spinner />;
  if (!isAuthenticated) return <SignInPrompt />;
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
