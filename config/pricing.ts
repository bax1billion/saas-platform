/**
 * White-label pricing configuration — the single source of truth for tier
 * display (marketing + subscribe page) and entitlement limits.
 *
 * Tier IDs mirror the SubscriptionTier enum in amplify/data/resource.ts and
 * the STRIPE_PRICE_* Amplify secrets; display names, prices, and feature
 * lists are per-product marketing copy edited here.
 *
 * Entitlement philosophy (docs/subscriptions-and-payments.md): gate on
 * SCALE (users, sites, per-vertical countable resources), not capability —
 * every tier gets every feature.
 */

/** Paid tiers. TRIAL exists in the backend enum but is not purchasable. */
export type TierId = "CORE" | "GROWTH" | "SCALE";

export interface TierDef {
  id: TierId;
  /** Display name shown on pricing cards. */
  name: string;
  /** Display price, e.g. "$99". Billing truth lives in Stripe prices. */
  price: string;
  description: string;
  features: string[];
  highlighted: boolean;
}

export const tiers: TierDef[] = [
  {
    id: "CORE",
    name: "Core",
    price: "$99",
    description: "Everything you need to get started. Full-featured from day one.",
    features: [
      "Up to 5 users",
      "1 site",
      "All core features",
      "AI-assisted workflows",
      "API access",
      "Email support",
    ],
    highlighted: false,
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: "$199",
    description: "Scale across teams and sites.",
    features: [
      "Up to 25 users",
      "Up to 3 sites",
      "All core features",
      "AI-assisted workflows",
      "API access",
      "Priority support",
    ],
    highlighted: true,
  },
  {
    id: "SCALE",
    name: "Scale",
    price: "$399",
    description: "No limits. Built for the whole organization.",
    features: [
      "Unlimited users",
      "Unlimited sites",
      "All core features",
      "AI-assisted workflows",
      "API access",
      "SSO / SCIM",
      "Dedicated support",
    ],
    highlighted: false,
  },
];

export const UNLIMITED = -1;

export interface TierLimits {
  maxUsers: number;
  maxSites: number;
  sso: boolean;
  /**
   * Verticals extend limits per countable domain resource, e.g.
   * `maxProjects?: number`. Add fields here and enforce them in the
   * corresponding create paths.
   */
}

/** Includes TRIAL: trialing orgs get GROWTH-level limits. */
export const TIER_LIMITS: Record<TierId | "TRIAL", TierLimits> = {
  CORE: { maxUsers: 5, maxSites: 1, sso: false },
  GROWTH: { maxUsers: 25, maxSites: 3, sso: false },
  SCALE: { maxUsers: UNLIMITED, maxSites: UNLIMITED, sso: true },
  TRIAL: { maxUsers: 25, maxSites: 3, sso: false },
};

export const TRIAL_DAYS = 14;
