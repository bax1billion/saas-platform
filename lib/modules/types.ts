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

/** Maturity, shown as a badge inside the app shell (never on the public site). */
export type ModuleStage = "ga" | "beta" | "planned";

export interface ModuleNavItem {
  label: string;
  /** Absolute path under the module's basePath, e.g. "/widgets/list". */
  href: string;
  icon?: LucideIcon;
}

/** A row on the small product screen mock rendered on marketing pages. */
export interface ModuleScreenRow {
  title: string;
  detail: string;
  action: string;
}

export interface ModuleDef {
  /**
   * Stable identifier. Used for entitlement checks, the Stripe Product
   * metadata key (`module=<id>`), `OrgSubscription.modules[]`, and the
   * `modules/<id>/` directory name. Lowercase, kebab-case, never renamed.
   */
  id: string;
  /**
   * Public URL segment for the marketing page (`productPath()`). Defaults
   * to `id`. Lets a product rename its public name without touching the
   * entitlement key (e.g. id `widgets`, slug `widget-tracker`).
   */
  slug?: string;
  /** Display name, e.g. "Widgets". */
  name: string;
  /**
   * Plain-language name shown under the short name so a first-time visitor
   * knows what it is, e.g. "Widget tracking".
   */
  plainName?: string;
  /** Three-to-five-word promise, e.g. "Cause, evidence, report." */
  tagline: string;
  /** One or two sentences for cards and meta descriptions. */
  description: string;
  icon: LucideIcon;
  /**
   * Module accent color as a CSS value — reference a token defined in
   * config/theme.css (e.g. "var(--module-widgets)"), never a hex
   * literal, so dark mode and re-theming stay one-file operations.
   */
  accent: string;
  /** Root route of the module inside the app shell, e.g. "/widgets". */
  basePath: string;
  /** In-module navigation (the module's "tabs"). First item is the landing view. */
  nav: ModuleNavItem[];
  /**
   * Optional lineup group for products with many modules, e.g.
   * "Prepare" / "Respond" / "People" / "Lead". When any module sets it, the
   * app shell sidebar renders one section per group in registry order
   * instead of a single "Modules" section, and marketing groups cards the
   * same way. A group may carry a colour token (`--group-<id>` in
   * config/theme.css) for headers and chips. Purely presentational.
   */
  group?: string;
  availability: ModuleAvailability;
  stage: ModuleStage;
  /** Display price for add-ons, e.g. "$149". Billing truth lives in Stripe. */
  price?: string;
  /** Marketing detail page (`productPath()`) content. */
  marketing: {
    /** The one-line product headline, e.g. "Every widget, tracked." */
    headline: string;
    /** Short outcome statements — the feature bullets. */
    bullets: string[];
    /** Optional longer paragraphs. */
    body?: string[];
    /** Extra features behind a "More features" toggle. */
    more?: string[];
    /** What is coming next, shown inside the app and on the product page. */
    coming?: string[];
    /** Seat ids (a product's own config) that use this product most. */
    seats?: string[];
    /** Module ids this product hands records to and reads from. */
    worksWith?: string[];
    /** Three sample rows for the product screen mock (seed data only). */
    screen?: ModuleScreenRow[];
  };
}
