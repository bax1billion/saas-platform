/**
 * Module registry helpers — foundation code that reads the product's module
 * registry (config/modules.ts) and answers "which modules exist / is this
 * org entitled to this one / which module owns this path".
 *
 * Entitlement resolution is pure and synchronous so it can run in the client
 * context, server components, and Lambdas alike.
 */

import { modules } from "@/config/modules";
import type { ModuleDef } from "./types";

export type { ModuleDef, ModuleAvailability, ModuleStage, ModuleNavItem } from "./types";

export { modules };

/** Modules that ship routes (everything except coming-soon). */
export const activeModules: ModuleDef[] = modules.filter(
  (m) => m.availability !== "coming-soon"
);

/** Add-on modules — rendered on pricing surfaces. */
export const addonModules: ModuleDef[] = modules.filter(
  (m) => m.availability === "addon"
);

export function getModule(id: string): ModuleDef | undefined {
  return modules.find((m) => m.id === id);
}

/** The module whose basePath is a prefix of the given pathname, if any. */
export function getModuleByPath(pathname: string): ModuleDef | undefined {
  return activeModules.find(
    (m) => pathname === m.basePath || pathname.startsWith(`${m.basePath}/`)
  );
}

export interface EntitlementSources {
  /** `OrgSubscription.modules` — mirrored from Stripe line items by the webhook. */
  subscriptionModules?: readonly string[] | null;
  /**
   * `Organization.settings.modules` — admin-granted overrides (pilots,
   * comps, internal orgs). Also the sandbox path while the Stripe webhook
   * is stubbed.
   */
  orgModules?: readonly string[] | null;
  /** Whether the org has an access-granting subscription (or is comped). */
  hasActiveSubscription: boolean;
}

/**
 * The set of module ids the org can use right now.
 *
 * - `included` modules require an active subscription.
 * - `addon` modules require the id to appear in a subscription line item
 *   or the org's settings override.
 * - `coming-soon` modules are never entitled.
 */
export function resolveEntitledModules(src: EntitlementSources): Set<string> {
  const granted = new Set<string>([
    ...(src.subscriptionModules ?? []),
    ...(src.orgModules ?? []),
  ]);
  const entitled = new Set<string>();
  for (const m of modules) {
    if (m.availability === "coming-soon") continue;
    if (m.availability === "included" && src.hasActiveSubscription) {
      entitled.add(m.id);
    } else if (granted.has(m.id)) {
      entitled.add(m.id);
    }
  }
  return entitled;
}

/** Human label for the availability badge. */
export function availabilityLabel(m: ModuleDef): string {
  switch (m.availability) {
    case "included":
      return "Included";
    case "addon":
      return m.price ? `Add-on · ${m.price}/mo` : "Add-on";
    case "coming-soon":
      return "Coming soon";
  }
}
