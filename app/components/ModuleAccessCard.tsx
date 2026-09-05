"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { getDataClient } from "@/lib/data-client";
import { toJsonField } from "@/lib/json";
import { addonModules } from "@/lib/modules";
import { useAuth } from "./AuthContext";
import { useEntitlements, type OrgSettings } from "./EntitlementsContext";
import ModuleIcon from "./ModuleIcon";

/**
 * Admin-only settings card exposing the documented entitlement overrides
 * (docs/modules.md → Entitlements): `Organization.settings.access = "comped"`
 * and `Organization.settings.modules[]`. This is the real mechanism used for
 * pilots, comps, and development orgs — production access comes from the
 * Stripe subscription and needs no toggles here.
 *
 * Visibility is a build-time gate: always shown in local dev; deployed
 * environments must opt in with NEXT_PUBLIC_PILOT_ACCESS=1 (set it for
 * staging, leave it unset in production). Note this hides the UI only —
 * org Admins can still write Organization.settings through the API, so
 * restricting overrides to the platform operator remains a roadmap item.
 *
 * Toggles update optimistically: the checkbox flips immediately, inputs
 * lock while the write + entitlement refresh are in flight, and the state
 * reverts (with a toast) if the write fails.
 */

const CARD_VISIBLE =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_PILOT_ACCESS === "1";

export default function ModuleAccessCard() {
  const { user } = useAuth();
  const { org, orgSettings, subscription, refresh } = useEntitlements();
  const [saving, setSaving] = useState(false);
  /** Optimistic view of settings while a write is in flight. */
  const [optimistic, setOptimistic] = useState<OrgSettings | null>(null);

  const isAdmin = user?.groups.includes("Admin") ?? false;
  if (!CARD_VISIBLE || !isAdmin || !org) return null;

  const settings = optimistic ?? orgSettings;
  const subscriptionModules = new Set(
    (subscription?.modules ?? []).filter(
      (m): m is string => typeof m === "string"
    )
  );
  const overrides = new Set(settings.modules ?? []);
  const comped = settings.access === "comped";
  const hasActiveSubscription =
    subscription != null &&
    ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status);

  const save = async (next: OrgSettings) => {
    setSaving(true);
    setOptimistic(next); // flip the UI immediately
    try {
      const { errors } = await getDataClient().models.Organization.update({
        id: org.id,
        settings: toJsonField(next),
      });
      if (errors?.length) throw new Error(errors[0].message);
      await refresh();
    } catch (err) {
      setOptimistic(null); // revert to the server truth
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setOptimistic(null);
      setSaving(false);
    }
  };

  const toggleComped = () =>
    save({
      ...settings,
      access: comped ? undefined : "comped",
    });

  const toggleModule = (id: string) => {
    const next = new Set(overrides);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save({ ...settings, modules: [...next] });
  };

  return (
    <section className="mt-8 rounded-xl border border-warning/40 bg-background p-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-warning" />
        <h2 className="font-serif text-xl font-bold text-foreground">
          Pilot &amp; development access
        </h2>
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Admin-only overrides for pilots, comps, and development orgs. Paying
        customers get access from their subscription — nothing here is needed
        once billing is live for this organization. Hidden in production
        unless <code className="rounded bg-muted px-1">NEXT_PUBLIC_PILOT_ACCESS=1</code>.
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={comped}
          disabled={saving}
          onChange={toggleComped}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-foreground">
            Complimentary base access
          </span>
          <span className="block text-muted-foreground">
            Treats this org as subscribed without a Stripe subscription.
            {hasActiveSubscription &&
              " (This org already has an active subscription — not needed.)"}
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
                  checked={viaSubscription || overrides.has(m.id)}
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
    </section>
  );
}
