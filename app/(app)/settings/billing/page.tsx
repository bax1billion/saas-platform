"use client";

import Link from "next/link";
import { useEntitlements } from "@/app/components/EntitlementsContext";
import ModuleIcon from "@/app/components/ModuleIcon";
import { tiers } from "@/config/pricing";
import { addonModules } from "@/lib/modules";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default function BillingPage() {
  const { subscription, tier, status, isActive, hasModule, orgSettings } =
    useEntitlements();
  const tierDef = tiers.find((t) => t.id === tier);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-serif text-3xl font-bold text-foreground">Billing</h1>

      <section className="mt-8 rounded-xl border border-border bg-background p-6">
        <h2 className="font-serif text-xl font-bold text-foreground">Plan</h2>
        {subscription ? (
          <dl className="mt-4 divide-y divide-border">
            <Row label="Plan" value={tierDef?.name ?? tier} />
            <Row
              label="Status"
              value={
                <span className={isActive ? "text-success" : "text-destructive"}>
                  {status?.replace("_", " ").toLowerCase()}
                </span>
              }
            />
            {subscription.currentPeriodEnd && (
              <Row
                label={subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}
                value={new Date(
                  subscription.currentPeriodEnd
                ).toLocaleDateString()}
              />
            )}
            {subscription.latestInvoiceUrl && (
              <Row
                label="Latest invoice"
                value={
                  <a
                    href={subscription.latestInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    View
                  </a>
                }
              />
            )}
          </dl>
        ) : orgSettings.access === "comped" ? (
          <p className="mt-3 text-sm text-foreground/70">
            This organization has complimentary access.
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-foreground/70">No active plan.</p>
            <Link
              href="/subscribe"
              className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Choose a plan
            </Link>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Payment methods and invoices are managed through the customer portal
          (roadmap item 1 in docs/ROADMAP.md).
        </p>
      </section>

      {addonModules.length > 0 && (
        <section className="mt-8 rounded-xl border border-border bg-background p-6">
          <h2 className="font-serif text-xl font-bold text-foreground">
            Add-on modules
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {addonModules.map((m) => {
              const on = hasModule(m.id);
              return (
                <li key={m.id} className="flex items-center gap-4 py-3">
                  <ModuleIcon module={m} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{m.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {m.tagline}
                    </div>
                  </div>
                  {on ? (
                    <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success">
                      Active
                    </span>
                  ) : (
                    <Link
                      href={`/subscribe?module=${m.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
                    >
                      Add{m.price ? ` · ${m.price}/mo` : ""}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
