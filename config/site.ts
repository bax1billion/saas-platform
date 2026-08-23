/**
 * White-label site configuration — the single source of truth for the
 * product's identity on the frontend.
 *
 * Launching a new product means editing:
 *   1. this file
 *   2. config/pricing.ts   (tiers, display prices, feature lists, limits)
 *   3. config/theme.css    (brand palette)
 *   4. public/ assets      (logo.svg, logo.png, logo-512.png,
 *                           apple-touch-icon.png, favicon-16.png,
 *                           favicon-32.png, app/icon.png)
 *
 * Server-safe: no secrets belong here — secrets live in .env.local and
 * Amplify secrets. The Amplify backend does not read this file; backend-side
 * identity values (APP_URL, SES identities) come from env vars / secrets set
 * per environment.
 */

export const siteConfig = {
  product: {
    /** User-facing product name: nav wordmark, auth dialogs, page titles. */
    name: "Acme",
    /** Short positioning phrase used in the default page title. */
    tagline: "The Modern SaaS Platform",
    /** Default SEO/meta description. */
    description:
      "A configurable SaaS foundation — replace this description with the product's value proposition.",
  },

  company: {
    /** Legal entity for the © line and terms/privacy. */
    legalName: "Acme Inc.",
    /** Publisher/organization brand (JSON-LD Organization, footer wordmark). */
    brandName: "Acme",
    supportEmail: "support@example.com",
  },

  urls: {
    /**
     * Canonical production origin. Drives metadataBase, sitemap.ts, robots.ts,
     * JSON-LD urls, and OG/breadcrumb absolute links.
     */
    base: "https://example.com",
  },

  seo: {
    keywords: ["saas", "platform"] as string[],
    /** e.g. "@acme" — null omits twitter site attribution. */
    twitterHandle: null as string | null,
  },

  nav: {
    main: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Blog", href: "/blog" },
    ],
    footer: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },

  blog: {
    /** Default author attribution for posts and Article JSON-LD. */
    authorName: "Acme Team",
  },

  auth: {
    /**
     * Cognito group names, in privilege order. Must match the backend's
     * amplify/shared/constants.ts (the authoritative list).
     */
    groups: ["Admin", "Member", "Viewer"],
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** "<Page> | <Product>" for subpages; "<Product> | <tagline>" for the root. */
export function pageTitle(page?: string): string {
  return page
    ? `${page} | ${siteConfig.product.name}`
    : `${siteConfig.product.name} | ${siteConfig.product.tagline}`;
}

/** Absolute URL on the canonical origin, for JSON-LD, sitemaps, and OG tags. */
export function absoluteUrl(path: string = "/"): string {
  return new URL(path, siteConfig.urls.base).toString();
}

/**
 * Colors for opengraph-image generation. Edge ImageResponse code cannot read
 * CSS variables, so these are duplicated from config/theme.css — keep in sync.
 */
export const ogTheme = {
  background: "#003366",
  accent: "#007A5E",
  foreground: "#ffffff",
} as const;
