"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/app/components/AuthContext";
import { useEntitlements } from "@/app/components/EntitlementsContext";
import ModuleIcon from "@/app/components/ModuleIcon";
import { activeModules, modules, availabilityLabel } from "@/lib/modules";
import { tiers } from "@/config/pricing";
import { siteConfig } from "@/config/site";

function SubscriptionCard() {
  const { subscription, tier, status, isActive, orgSettings } =
    useEntitlements();
  const tierName = tiers.find((t) => t.id === tier)?.name ?? tier ?? "—";

  if (!subscription && orgSettings.access !== "comped") {
    return (
      <div className="rounded-xl border border-border bg-background p-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Subscription
        </div>
        <p className="mt-2 font-serif text-xl font-bold text-foreground">
          No plan yet
        </p>
        <p className="mt-1 text-sm text-foreground/60">
          Pick a plan to unlock the platform for your organization.
        </p>
        <Link
          href="/subscribe"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Choose a plan <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Subscription
      </div>
      <p className="mt-2 font-serif text-xl font-bold text-foreground">
        {orgSettings.access === "comped" && !subscription
          ? "Complimentary access"
          : `${tierName} plan`}
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            isActive ? "bg-success" : "bg-destructive"
          }`}
        />
        <span className="text-foreground/70">
          {status ? status.replace("_", " ").toLowerCase() : "comped"}
        </span>
        {subscription?.currentPeriodEnd && (
          <span className="text-muted-foreground">
            · renews{" "}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </span>
        )}
      </div>
      <Link
        href="/settings/billing"
        className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Manage billing
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { org, hasModule } = useEntitlements();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{org?.name}</p>
        <h1 className="font-serif text-3xl font-bold text-foreground">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Modules
          </h2>
          {modules.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/60">
              No modules registered yet — add the first one in{" "}
              <code className="rounded bg-muted px-1">config/modules.ts</code>{" "}
              (see docs/modules.md).
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {activeModules.map((m) => {
                const entitled = hasModule(m.id);
                return (
                  <Link
                    key={m.id}
                    href={m.basePath}
                    className="group flex flex-col rounded-xl border border-border bg-background p-5 transition-shadow hover:shadow-md"
                    style={{ borderTopColor: m.accent, borderTopWidth: 3 }}
                  >
                    <div className="flex items-center justify-between">
                      <ModuleIcon module={m} size="md" />
                      {entitled ? (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Lock className="h-3 w-3" /> {availabilityLabel(m)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 font-serif text-lg font-bold text-foreground">
                      {m.name}
                    </h3>
                    <p className="mt-1 flex-1 text-sm text-foreground/60">
                      {m.description}
                    </p>
                    <span className="mt-3 text-sm font-semibold text-primary group-hover:underline">
                      {entitled ? "Open" : "Add module"} →
                    </span>
                  </Link>
                );
              })}
              {modules
                .filter((m) => m.availability === "coming-soon")
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col rounded-xl border border-dashed border-border bg-background/50 p-5 opacity-70"
                  >
                    <div className="flex items-center justify-between">
                      <ModuleIcon module={m} size="md" />
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Coming soon
                      </span>
                    </div>
                    <h3 className="mt-3 font-serif text-lg font-bold text-foreground">
                      {m.name}
                    </h3>
                    <p className="mt-1 text-sm text-foreground/60">{m.tagline}</p>
                  </div>
                ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <SubscriptionCard />
          <div className="rounded-xl border border-border bg-background p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Need help?
            </div>
            <p className="mt-2 text-sm text-foreground/70">
              Email{" "}
              <a
                href={`mailto:${siteConfig.company.supportEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                {siteConfig.company.supportEmail}
              </a>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
