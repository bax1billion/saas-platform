"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Check } from "lucide-react";
import { getDataClient } from "@/lib/data-client";
import { useAuth } from "@/app/components/AuthContext";
import ModuleIcon from "@/app/components/ModuleIcon";
import { tiers, type TierId } from "@/config/pricing";
import { landing } from "@/config/landing";
import { addonModules } from "@/lib/modules";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function SubscribeContent() {
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // ?module=<id> (from a locked ModuleShell or the billing page) preselects
  // that add-on; users can toggle any add-on before checkout.
  const requested = searchParams.get("module");
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    () =>
      new Set(
        addonModules.filter((m) => m.id === requested).map((m) => m.id)
      )
  );

  const toggleModule = (id: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectPlan = async (tier: TierId) => {
    if (!user) return;

    setSelectedTier(tier);
    setIsCreatingSession(true);
    setError(null);

    try {
      const client = getDataClient();
      // Look up User record to get orgId
      const { data: users } = await client.models.User.usersByCognitoSub({
        cognitoSub: user.userId,
      });

      const orgId = users?.[0]?.orgId;
      if (!orgId) {
        throw new Error("Please complete onboarding before subscribing.");
      }

      const { data, errors } = await client.mutations.createCheckoutSession({
        tier,
        orgId,
        modules: [...selectedModules],
      });

      if (errors?.length || !data?.clientSecret) {
        throw new Error(
          errors?.[0]?.message || "Failed to create checkout session"
        );
      }

      setClientSecret(data.clientSecret);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setSelectedTier(null);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleBack = () => {
    setSelectedTier(null);
    setClientSecret(null);
    setError(null);
  };

  // Loading state
  if (authLoading) {
    return <Spinner />;
  }

  // Auth guard
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-foreground">
            Sign in to subscribe
          </h1>
          <p className="mt-2 text-foreground/60">
            You need to be signed in to choose a plan.
          </p>
          <a
            href="/onboarding"
            className="mt-4 inline-block rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  // Phase 2: Embedded Checkout
  if (clientSecret) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <button
            onClick={handleBack}
            className="mb-6 text-sm text-foreground/60 transition-colors hover:text-foreground"
          >
            &larr; Back to plan selection
          </button>
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    );
  }

  // Phase 1: Plan Selection
  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto max-w-6xl px-6 py-12 text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-foreground/60">
          {landing.pricing.subheadline}
        </p>
        {error && (
          <div className="mx-auto mt-4 max-w-md rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {addonModules.length > 0 && (
          <div className="mx-auto mt-10 max-w-3xl text-left">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {landing.pricing.addOnsHeadline}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {addonModules.map((m) => {
                const on = selectedModules.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModule(m.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                      on
                        ? "border-primary bg-background"
                        : "border-foreground/10 bg-background/60 hover:bg-background"
                    }`}
                  >
                    <ModuleIcon module={m} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="truncate text-xs text-foreground/60">
                        {m.tagline}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {m.price && (
                        <div className="font-semibold text-foreground">
                          {m.price}
                          <span className="text-foreground/50">/mo</span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-foreground/20"
                      }`}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-xl p-8 text-left ${
                tier.highlighted
                  ? "border-2 border-primary bg-background"
                  : "border border-foreground/10 bg-background"
              }`}
            >
              <h3
                className={`text-sm font-semibold uppercase tracking-wide ${
                  tier.highlighted ? "text-primary" : "text-foreground/50"
                }`}
              >
                {tier.name}
              </h3>
              <div className="mt-4">
                <span className="font-serif text-4xl font-bold text-foreground">
                  {tier.price}
                </span>
                <span className="text-foreground/50">/mo</span>
              </div>
              <p className="mt-3 text-sm text-foreground/60">{tier.description}</p>
              <ul className="mt-6 space-y-2">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground/70"
                  >
                    <span className="mt-0.5 text-primary">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelectPlan(tier.id)}
                disabled={isCreatingSession}
                className={`mt-8 w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  tier.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-foreground/15 bg-background text-foreground hover:bg-muted"
                }`}
              >
                {isCreatingSession && selectedTier === tier.id
                  ? "Loading..."
                  : selectedModules.size > 0
                    ? `Select Plan + ${selectedModules.size} add-on${selectedModules.size > 1 ? "s" : ""}`
                    : "Select Plan"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SubscribeContent />
    </Suspense>
  );
}
