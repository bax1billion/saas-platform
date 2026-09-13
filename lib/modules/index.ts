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

/**
 * Add-on modules that are actually for sale — rendered on the surfaces that
 * start a checkout (/subscribe, billing settings). A `planned` add-on has
 * no Stripe Price behind it yet (`verticalModulePriceSecrets`), so offering
 * it would fail at checkout: it ships routes and can be granted via an
 * operator entitlement override, but it is never listed as purchasable.
 * See `isPreview`.
 */
export const addonModules: ModuleDef[] = modules.filter(
  (m) => m.availability === "addon" && m.stage !== "planned"
);

/**
 * Every add-on worth naming on marketing surfaces — the purchasable ones
 * plus previews. The homepage pricing strip uses this so the lineup reads
 * complete; a preview shows its `Preview` badge where a price would go and
 * links to its marketing page, never to checkout. The operator entitlement
 * card uses it too, so a preview can be comped before it is sellable.
 * Anything that can start a checkout must use `addonModules` instead.
 */
export const marketedAddonModules: ModuleDef[] = modules.filter(
  (m) => m.availability === "addon"
);

/**
 * True while a module ships routes but is not yet for sale — the app shows
 * it (locked, next to the modules an org owns) and marketing keeps the soft
 * "notify me" CTA instead of a buy button.
 */
export function isPreview(m: ModuleDef): boolean {
  return m.availability !== "coming-soon" && m.stage === "planned";
}

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
   * `OrgEntitlementOverride.modules` — operator-granted modules (pilots,
   * comps, internal orgs, previews), applied only while the override is
   * live. Also the sandbox path while the Stripe webhook is stubbed.
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
 *   or the org's live entitlement override.
 * - `coming-soon` modules are never entitled.
 */
export function resolveEntitledModules(
  src: EntitlementSources,
  moduleDefs: readonly ModuleDef[] = modules
): Set<string> {
  const granted = new Set<string>([
    ...(src.subscriptionModules ?? []),
    ...(src.orgModules ?? []),
  ]);
  const entitled = new Set<string>();
  for (const m of moduleDefs) {
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
      if (isPreview(m)) return "Preview";
      return m.price ? `Add-on · ${m.price}/mo` : "Add-on";
    case "coming-soon":
      return "Coming soon";
  }
}
