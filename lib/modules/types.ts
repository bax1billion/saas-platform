import type { LucideIcon } from "lucide-react";

/**
 * A module is a product inside the product: a self-contained feature area
 * (its own routes, nav, data models and marketing page) that an organization
 * is entitled to either because it is included with every plan or because
 * it was purchased as a subscription add-on.
 *
 * Definitions live in the product's registry (config/modules.ts); the code
 * for each module lives in modules/<id>/. See docs/modules.md.
 */

/** How an org comes to have the module. */
export type ModuleAvailability =
  /** Every active subscription gets it. */
  | "included"
  /** Purchased as a Stripe add-on line item (Product metadata `module=<id>`). */
  | "addon"
  /** Shown in marketing, never entitled, no routes required. */
  | "coming-soon";

/** Maturity, shown as a badge in marketing and the app shell. */
export type ModuleStage = "ga" | "beta" | "planned";

export interface ModuleNavItem {
  label: string;
  /** Absolute path under the module's basePath, e.g. "/investigations/cases". */
  href: string;
  icon?: LucideIcon;
}

export interface ModuleDef {
  /**
   * Stable identifier. Used for entitlement checks, the Stripe Product
   * metadata key (`module=<id>`), `OrgSubscription.modules[]`, and the
   * `modules/<id>/` directory name. Lowercase, kebab-case, never renamed.
   */
  id: string;
  /** Display name, e.g. "Investigations". */
  name: string;
  /** Three-to-five-word promise, e.g. "Cause, evidence, report." */
  tagline: string;
  /** One or two sentences for cards and meta descriptions. */
  description: string;
  icon: LucideIcon;
  /**
   * Module accent color as a CSS value — reference a token defined in
   * config/theme.css (e.g. "var(--module-investigations)"), never a hex
   * literal, so dark mode and re-theming stay one-file operations.
   */
  accent: string;
  /** Root route of the module inside the app shell, e.g. "/investigations". */
  basePath: string;
  /** In-module navigation (the module's "tabs"). First item is the landing view. */
  nav: ModuleNavItem[];
  availability: ModuleAvailability;
  stage: ModuleStage;
  /** Display price for add-ons, e.g. "$149". Billing truth lives in Stripe. */
  price?: string;
  /** Marketing detail page (/modules/<id>) content. */
  marketing: {
    headline: string;
    /** Short outcome statements — the feature bullets. */
    bullets: string[];
    /** Optional longer paragraphs. */
    body?: string[];
  };
}
