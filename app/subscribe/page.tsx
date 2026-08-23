"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { useAuth } from "@/app/components/AuthContext";
import { tiers } from "@/config/pricing";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const client = generateClient<Schema>();

export default function SubscribePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleSelectPlan = async (tier: string) => {
    if (!user) return;

    setSelectedTier(tier);
    setIsCreatingSession(true);
    setError(null);

    try {
      // Look up User record to get orgId
      const { data: users } = await client.models.User.usersByCognitoSub({
        cognitoSub: user.userId,
      });

      const orgId = users?.[0]?.orgId;
      if (!orgId) {
        throw new Error(
          "Please complete onboarding before subscribing."
        );
      }

      const { data, errors } = await client.mutations.createCheckoutSession({
        tier: tier as "CORE" | "GROWTH" | "SCALE",
        orgId,
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
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
            href="/"
            className="mt-4 inline-block rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Go to homepage
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
          Every plan includes all core modules. Pick the scale that fits.
        </p>
        {error && (
          <div className="mx-auto mt-4 max-w-md rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
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
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-foreground/15 bg-background text-foreground hover:bg-muted"
                }`}
              >
                {isCreatingSession && selectedTier === tier.id
                  ? "Loading..."
                  : "Select Plan"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
