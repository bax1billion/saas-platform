"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { getDataClient } from "@/lib/data-client";
import { addonModules } from "@/lib/modules";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";
import ModuleIcon from "./ModuleIcon";

/**
 * Platform-operator card managing the org's OrgEntitlementOverride —
 * pilots, comps, and offline purchases (checks/POs) where Stripe checkout
 * doesn't apply. Renders ONLY for members of the Operator Cognito group;
 * org Admins neither see it nor can write the underlying model, so it is
 * production-safe by construction (docs/modules.md → Entitlements).
 *
 * Toggles update optimistically; inputs lock while a write is in flight
 * and revert on failure.
 */

type Draft = {
  comped: boolean;
  modules: string[];
  reason: string;
  expiresAt: string; // yyyy-mm-dd or ""
};

export default function ModuleAccessCard() {
  const { user } = useAuth();
  const { org, subscription, entitlementOverride, refresh } = useEntitlements();
  const [saving, setSaving] = useState(false);
  const [optimistic, setOptimistic] = useState<Draft | null>(null);

  const isOperator = user?.groups.includes("Operator") ?? false;
  if (!isOperator || !org) return null;

  const stored: Draft = {
    comped: entitlementOverride?.access === "comped",
    modules: (entitlementOverride?.modules ?? []).filter(
      (m): m is string => typeof m === "string"
    ),
    reason: entitlementOverride?.reason ?? "",
    expiresAt: entitlementOverride?.expiresAt
      ? entitlementOverride.expiresAt.slice(0, 10)
      : "",
  };
  const draft = optimistic ?? stored;
  const expired =
    !!entitlementOverride?.expiresAt &&
    entitlementOverride.expiresAt <= new Date().toISOString();

  const subscriptionModules = new Set(
    (subscription?.modules ?? []).filter(
      (m): m is string => typeof m === "string"
    )
  );

  const save = async (next: Draft) => {
    setSaving(true);
    setOptimistic(next);
    try {
      const client = getDataClient();
      const fields = {
        orgId: org.id,
        access: next.comped ? "comped" : null,
        modules: next.modules,
        reason: next.reason || null,
        grantedBy: user?.email ?? null,
        expiresAt: next.expiresAt
          ? new Date(`${next.expiresAt}T23:59:59Z`).toISOString()
          : null,
      };
      const { errors } = entitlementOverride
        ? await client.models.OrgEntitlementOverride.update({
            id: entitlementOverride.id,
            ...fields,
          })
        : await client.models.OrgEntitlementOverride.create({
            ...fields,
            sortDate: new Date().toISOString(),
          });
      if (errors?.length) throw new Error(errors[0].message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setOptimistic(null);
      setSaving(false);
    }
  };

  const toggleModule = (id: string) => {
    const next = new Set(draft.modules);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save({ ...draft, modules: [...next] });
  };

  return (
    <section className="mt-8 rounded-xl border border-warning/40 bg-background p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-warning" />
        <h2 className="font-serif text-xl font-bold text-foreground">
          Operator: entitlement override
        </h2>
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Platform-operator grants for pilots, comps, and offline purchases
        (checks / purchase orders). Visible to the Operator group only; org
        Admins cannot write these. Every change lands in the audit trail.
        {expired && (
          <span className="mt-1 block font-semibold text-destructive">
            This override expired
            {entitlementOverride?.expiresAt
              ? ` on ${entitlementOverride.expiresAt.slice(0, 10)}`
              : ""}{" "}
            and currently grants nothing.
          </span>
        )}
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.comped}
          disabled={saving}
          onChange={() => save({ ...draft, comped: !draft.comped })}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-foreground">
            Complimentary base access
          </span>
          <span className="block text-muted-foreground">
            Treats this org as subscribed without a Stripe subscription.
          </span>
        </span>
      </label>

      {addonModules.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add-on modules
          </div>
          {addonModules.map((m) => {
            const viaSubscription = subscriptionModules.has(m.id);
            return (
              <label key={m.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={viaSubscription || draft.modules.includes(m.id)}
                  disabled={saving || viaSubscription}
                  onChange={() => toggleModule(m.id)}
                />
                <ModuleIcon module={m} size="sm" />
                <span className="font-medium text-foreground">{m.name}</span>
                {viaSubscription && (
                  <span className="text-xs text-muted-foreground">
                    licensed via subscription
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label
            htmlFor="ov-reason"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Reason
          </label>
          <input
            id="ov-reason"
            defaultValue={stored.reason}
            key={`reason-${entitlementOverride?.id ?? "new"}`}
            placeholder='e.g. "90-day founding pilot" or "PO #1234, check net-30"'
            disabled={saving}
            onBlur={(e) => {
              if (e.target.value !== stored.reason)
                save({ ...draft, reason: e.target.value });
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label
            htmlFor="ov-expires"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Expires
          </label>
          <input
            id="ov-expires"
            type="date"
            defaultValue={stored.expiresAt}
            key={`exp-${entitlementOverride?.id ?? "new"}`}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value !== stored.expiresAt)
                save({ ...draft, expiresAt: e.target.value });
            }}
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          />
        </div>
      </div>
    </section>
  );
}
