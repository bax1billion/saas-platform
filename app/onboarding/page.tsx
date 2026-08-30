"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import EntitlementsProvider, {
  useEntitlements,
} from "@/app/components/EntitlementsContext";
import AuthModal from "@/app/components/AuthModal";
import { getDataClient } from "@/lib/data-client";
import { siteConfig } from "@/config/site";

function OnboardingForm() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { isLoading, needsOnboarding, refresh } = useEntitlements();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already onboarded → straight to the app
  useEffect(() => {
    if (!isLoading && !needsOnboarding) router.replace("/dashboard");
  }, [isLoading, needsOnboarding, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data, errors } =
        await getDataClient().mutations.provisionOrganization({ name });
      if (errors?.length || !data?.orgId) {
        throw new Error(errors?.[0]?.message ?? "Could not create organization");
      }
      // The Lambda added us to the Admin group — pull a fresh token so the
      // new group claim is in place before the app loads.
      await refreshUser({ forceRefresh: true });
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  if (isLoading || !needsOnboarding) {
    return (
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
      <img
        src="/logo.png"
        alt={siteConfig.product.name}
        width={40}
        height={40}
        className="h-10 w-10 rounded-lg"
      />
      <h1 className="mt-5 font-serif text-2xl font-bold text-foreground">
        Set up your organization
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        This is the workspace your team will share. You&apos;ll be its first
        administrator.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="orgName"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Organization name
          </label>
          <input
            id="orgName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoFocus
            placeholder="Your organization's name"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none ring-ring/50 focus:ring-[3px]"
          />
        </div>
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting || name.trim().length < 2}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create organization"}
        </button>
      </form>
    </div>
  );
}

function OnboardingGate() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth();

  if (isLoading) {
    return (
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Sign in to continue
        </h1>
        <p className="mt-2 text-foreground/60">
          Create an account or sign in to set up your organization.
        </p>
        <button
          onClick={() => openAuthModal("signUp")}
          className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Get started
        </button>
        <AuthModal />
      </div>
    );
  }

  return <OnboardingForm />;
}

export default function OnboardingPage() {
  return (
    <EntitlementsProvider>
      <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">
        <OnboardingGate />
      </div>
    </EntitlementsProvider>
  );
}
