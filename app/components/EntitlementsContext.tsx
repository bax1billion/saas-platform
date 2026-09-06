"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { getDataClient, type Schema } from "@/lib/data-client";
import { resolveEntitledModules } from "@/lib/modules";
import { parseJsonField } from "@/lib/json";
import type { TierId } from "@/config/pricing";

type UserRecord = Schema["User"]["type"];
type OrgRecord = Schema["Organization"]["type"];
type SubscriptionRecord = Schema["OrgSubscription"]["type"];
type OverrideRecord = Schema["OrgEntitlementOverride"]["type"];
export type SubscriptionStatus = SubscriptionRecord["status"];

/**
 * Shape of the `Organization.settings` JSON bag. Entitlement overrides no
 * longer live here — they moved to the OrgEntitlementOverride model
 * (Operator-written) so org Admins cannot grant themselves access.
 */
export interface OrgSettings {
  [key: string]: unknown;
}

/** True while the operator-granted override is unexpired. */
function overrideIsLive(o: OverrideRecord | null): o is OverrideRecord {
  return o !== null && (!o.expiresAt || o.expiresAt > new Date().toISOString());
}

const ACCESS_GRANTING: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

type EntitlementsContextType = {
  isLoading: boolean;
  /** The caller's User record (null until loaded or if none exists). */
  userRecord: UserRecord | null;
  org: OrgRecord | null;
  orgSettings: OrgSettings;
  subscription: SubscriptionRecord | null;
  /** Latest operator-granted override record (may be expired). */
  entitlementOverride: OverrideRecord | null;
  tier: TierId | "TRIAL" | null;
  status: SubscriptionStatus | null;
  /** ACTIVE / TRIALING / PAST_DUE, or an unexpired operator comp. */
  isActive: boolean;
  /** Signed in but no organization yet. */
  needsOnboarding: boolean;
  /** Has an org but no access-granting subscription. */
  needsSubscription: boolean;
  /** Module ids the org can use right now. */
  modules: Set<string>;
  hasModule: (id: string) => boolean;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextType>({
  isLoading: true,
  userRecord: null,
  org: null,
  orgSettings: {},
  subscription: null,
  entitlementOverride: null,
  tier: null,
  status: null,
  isActive: false,
  needsOnboarding: false,
  needsSubscription: false,
  modules: new Set(),
  hasModule: () => false,
  refresh: async () => {},
});

export function useEntitlements() {
  return useContext(EntitlementsContext);
}

type LoadedRecords = {
  userRecord: UserRecord | null;
  org: OrgRecord | null;
  subscription: SubscriptionRecord | null;
  entitlementOverride: OverrideRecord | null;
};

const EMPTY_RECORDS: LoadedRecords = {
  userRecord: null,
  org: null,
  subscription: null,
  entitlementOverride: null,
};

async function fetchRecords(cognitoSub: string | null): Promise<LoadedRecords> {
  if (!cognitoSub) return EMPTY_RECORDS;
  const client = getDataClient();

  const { data: users } = await client.models.User.usersByCognitoSub({
    cognitoSub,
  });
  const userRecord = users?.[0] ?? null;
  if (!userRecord?.orgId) return { ...EMPTY_RECORDS, userRecord };

  const [{ data: org }, { data: subs }, { data: overrides }] =
    await Promise.all([
      client.models.Organization.get({ id: userRecord.orgId }),
      client.models.OrgSubscription.subscriptionsByOrg(
        { orgId: userRecord.orgId },
        { sortDirection: "DESC", limit: 1 }
      ),
      client.models.OrgEntitlementOverride.entitlementOverridesByOrg(
        { orgId: userRecord.orgId },
        { sortDirection: "DESC", limit: 1 }
      ),
    ]);
  return {
    userRecord,
    org: org ?? null,
    subscription: subs?.[0] ?? null,
    entitlementOverride: overrides?.[0] ?? null,
  };
}

/**
 * Loads User → Organization → latest OrgSubscription + operator override
 * for the signed-in user and resolves module entitlements. Mount inside
 * AuthProvider, only on routes that need it (the app shell and onboarding)
 * — marketing pages shouldn't pay for the queries per visit.
 */
export default function EntitlementsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  /** userId the current records were loaded for; undefined = not yet. */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(
    undefined
  );
  const [records, setRecords] = useState<LoadedRecords>(EMPTY_RECORDS);
  const { userRecord, org, subscription, entitlementOverride } = records;

  const currentUserId = user?.userId ?? null;

  const load = useCallback(async () => {
    const next = await fetchRecords(currentUserId);
    setRecords(next);
  }, [currentUserId]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    fetchRecords(currentUserId)
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch((err) => {
        console.error("EntitlementsProvider: load failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(currentUserId);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUserId]);

  const isLoading = authLoading || loadedFor !== currentUserId;

  const value = useMemo<EntitlementsContextType>(() => {
    const orgSettings = parseJsonField<OrgSettings>(org?.settings, {});
    const liveOverride = overrideIsLive(entitlementOverride)
      ? entitlementOverride
      : null;
    const status = subscription?.status ?? null;
    const isActive =
      (status !== null && ACCESS_GRANTING.includes(status)) ||
      liveOverride?.access === "comped";
    const modules = resolveEntitledModules({
      subscriptionModules: subscription?.modules?.filter(
        (m): m is string => typeof m === "string"
      ),
      orgModules: liveOverride?.modules?.filter(
        (m): m is string => typeof m === "string"
      ),
      hasActiveSubscription: isActive,
    });
    const loaded = !isLoading;

    return {
      isLoading,
      userRecord,
      org,
      orgSettings,
      subscription,
      entitlementOverride,
      tier: (subscription?.tier as TierId | "TRIAL" | undefined) ?? null,
      status,
      isActive,
      needsOnboarding: loaded && isAuthenticated && !userRecord?.orgId,
      needsSubscription: loaded && !!org && !isActive,
      modules,
      hasModule: (id: string) => modules.has(id),
      refresh: async () => {
        await load();
      },
    };
  }, [
    isLoading,
    isAuthenticated,
    userRecord,
    org,
    subscription,
    entitlementOverride,
    load,
  ]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}
