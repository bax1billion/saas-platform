/**
 * White-label landing-page content — the single source of truth for the
 * marketing homepage copy. Section components in app/components/ are pure
 * renderers of this file; a product changes what the homepage SAYS here and
 * never touches the components.
 *
 * Section order and presence are also configured here (`sections`), so a
 * product can drop the trust strip, move pricing up, etc. Pricing content
 * lives in config/pricing.ts; module cards render from config/modules.ts.
 *
 * Icons are Lucide components (see docs/design-system.md). Colors are
 * semantic Tailwind utilities only — never hex literals.
 */

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ShieldCheck,
  PackageCheck,
  ScrollText,
  FolderOpen,
  FileClock,
  UserX,
} from "lucide-react";

export type LandingSectionId =
  | "hero"
  | "painPoints"
  | "modules"
  | "features"
  | "preview"
  | "trust"
  | "pricing";

export interface LandingCta {
  label: string;
  /** Anchor or path for link CTAs; omit to open the early-access modal. */
  href?: string;
}

export interface LandingCard {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Semantic text-color utility for pain-point icons (e.g. "text-warning"). */
  tone?: "text-destructive" | "text-warning" | "text-primary" | "text-info";
}

export type PreviewStatus = "green" | "amber" | "red";

export const landing = {
  /** Sections rendered on the homepage, in order. */
  sections: [
    "hero",
    "painPoints",
    "modules",
    "features",
    "preview",
    "trust",
    "pricing",
  ] as LandingSectionId[],

  hero: {
    /** Small eyebrow pill above the headline; defaults to the product name. */
    eyebrow: null as string | null,
    /** Use "\n" for a hard line break. */
    headline: "Run your business.\nAll in one place.",
    subheadline:
      "A modern workspace for growing teams. Bring your work, your people and your data together — and get more done with less overhead.",
    primaryCta: { label: "Get early access" } as LandingCta,
    secondaryCta: { label: "See how it works", href: "#features" } as LandingCta,
  },

  painPoints: {
    headline: "Spreadsheets and inboxes don't scale.",
    subheadline:
      "When work lives everywhere, nothing gets the attention it needs. Your team deserves one reliable place to run on.",
    cards: [
      {
        title: "Scattered tools",
        description:
          "Work spread across spreadsheets, shared drives and email chains. Finding the latest version takes longer than the work itself.",
        icon: FolderOpen,
        tone: "text-destructive",
      },
      {
        title: "Manual busywork",
        description:
          "Repetitive updates, copy-paste reporting and chasing status by hand eat hours out of every week.",
        icon: FileClock,
        tone: "text-warning",
      },
      {
        title: "No visibility",
        description:
          "No single view of who is doing what, what is on track, or what is quietly falling behind.",
        icon: UserX,
        tone: "text-warning",
      },
    ] as LandingCard[],
  },

  /** The module showcase — cards come from config/modules.ts. */
  modules: {
    headline: "One platform. Pick the modules you need.",
    subheadline:
      "Every module shares the same login, the same layout and the same data. Start with one, add the rest when you're ready.",
  },

  features: {
    headline: "Everything you need to launch",
    subheadline: "One solid foundation. No enterprise bloat.",
    cards: [
      {
        title: "Multi-tenant workspaces",
        description:
          "Give every customer an isolated workspace with its own members, data and settings. Clean separation by default.",
        icon: Building2,
      },
      {
        title: "Role-based access",
        description:
          "Invite teammates with the right level of permission. Owners, admins and members work out of the box.",
        icon: ShieldCheck,
      },
      {
        title: "Billing & plans",
        description:
          "Subscriptions, upgrades and invoices handled end to end. Customers change plans without a support ticket.",
        icon: PackageCheck,
      },
      {
        title: "Audit trail",
        description:
          "Every important action is logged with who, what and when. A complete history you can rely on.",
        icon: ScrollText,
      },
    ] as LandingCard[],
  },

  preview: {
    headline: "Know where things stand at a glance",
    subheadline:
      "The overview dashboard shows red, yellow and green across everything your team is working on. No more chasing status — spot problems early and act with confidence.",
    legend: [
      { status: "green", label: "On track — everything up to date, nothing to do" },
      { status: "amber", label: "Needs attention — action needed soon" },
      { status: "red", label: "Overdue — past its due date, blocking progress" },
    ] as { status: PreviewStatus; label: string }[],
    mock: {
      title: "Workspace Overview",
      caption: "This month",
      rows: [
        { label: "Active users", status: "green", value: "128" },
        { label: "Tasks completed", status: "green", value: "47/52" },
        { label: "Projects on track", status: "amber", value: "9/12" },
        { label: "Items overdue", status: "red", value: "3" },
      ] as { label: string; status: PreviewStatus; value: string }[],
      progressLabel: "Overall progress",
      progressPct: 87,
    },
  },

  trust: {
    headline: "Built on a proven stack",
    subheadline:
      "Battle-tested infrastructure and tooling, so you can focus on your product instead of plumbing.",
    items: [
      "Next.js",
      "AWS Amplify",
      "Stripe",
      "Amazon Cognito",
      "DynamoDB",
      "Tailwind CSS",
      "TypeScript",
    ] as string[],
  },

  pricing: {
    headline: "Transparent pricing. No surprises.",
    subheadline: "Every plan includes all core modules. Pick the scale that fits.",
    /** Shown under the tier grid when add-on modules exist in config/modules.ts. */
    addOnsHeadline: "Add-on modules",
    addOnsSubheadline:
      "Modules are priced per organization, not per seat, and can be added to any plan.",
  },

  footerCta: {
    headline: "Ready to get started?",
    subheadline:
      "Join teams who run their work in one place. Start your trial today.",
    cta: { label: "Start my free trial" } as LandingCta,
  },
};

export type LandingConfig = typeof landing;
