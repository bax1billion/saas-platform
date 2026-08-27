"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { siteConfig } from "@/config/site";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="mt-2 text-foreground/60">
            No checkout session found. Please try again.
          </p>
          <a
            href="/subscribe"
            className="mt-4 inline-block rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Back to plans
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <span className="text-3xl text-primary">&#10003;</span>
        </div>
        <h1 className="mt-6 font-serif text-2xl font-bold text-foreground">
          Welcome to {siteConfig.product.name}!
        </h1>
        <p className="mt-2 text-foreground/60">
          Your subscription is being activated. You&apos;ll be redirected to
          your dashboard shortly.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

export default function SubscribeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
