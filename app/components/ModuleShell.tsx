"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { getModule, availabilityLabel, isPreview, productPath, type ModuleDef, type ModuleNavItem } from "@/lib/modules";
import { activeNavHref } from "@/lib/modules/active-nav";
import { isAdminPath } from "@/lib/shell/door";
import { routeItems } from "@/lib/shell/rail-model";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";
import { canManageOrg } from "@/lib/roles";
import ModuleIcon from "./ModuleIcon";
import SectionRail from "./shell/SectionRail";
import { SectionRailProvider, useSections } from "./shell/SectionRailContext";

/**
 * The Admin door's menu is a section rail by rule (docs/shell.md, Section
 * rail: the Admin pages are a level-2 menu), so on an Admin path the
 * product's admin pages are registered as the rail's default and the
 * header tab strip hides. A page that registers its own sections takes
 * the rail over while it is mounted. Everywhere else the tabs stay in the
 * header and the rail belongs to the record or workflow on screen.
 */
function AdminRoutes({ name, nav, activeHref }: { name: string; nav: ModuleNavItem[]; activeHref: string | null }) {
  useSections({ mode: "routes", label: name, items: routeItems(nav), activeId: activeHref ?? undefined }, { fallback: true });
  return null;
}

const stageLabel: Record<ModuleDef["stage"], string | null> = {
  ga: null,
  beta: "Beta",
  planned: "Preview",
};

function ModuleLocked({ module }: { module: ModuleDef }) {
  const { user } = useAuth();
  // Members never see a price or a buy button. Admins and operators do.
  const manager = canManageOrg(user?.groups);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div
        className="rounded-2xl border border-border bg-background p-8 shadow-sm"
        style={{ borderTopColor: module.accent, borderTopWidth: 4 }}
      >
        <div className="flex items-center gap-4">
          <ModuleIcon module={module} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-bold text-foreground">
                {module.name}
              </h1>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium" style={{ color: module.accent }}>
              {module.tagline}
            </p>
          </div>
        </div>
        <p className="mt-6 text-lg leading-relaxed text-foreground/70">
          {module.marketing.headline}
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {module.marketing.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-foreground/80">
              <span
                className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: module.accent }}
              />
              {b}
            </li>
          ))}
        </ul>
        {!manager && (
          <p className="mt-6 text-sm text-muted-foreground">
            {module.name} is not on your organization&apos;s plan yet. An admin can add it.
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* A preview module has no price behind it yet — don't offer to sell it. */}
          {manager && !isPreview(module) && (
            <Link
              href={`/subscribe?module=${module.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Add {module.name}
              {module.price ? ` · ${module.price}/mo` : ""}
            </Link>
          )}
          <Link
            href={productPath(module)}
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Learn more
          </Link>
          {manager && (
            <span className="text-xs text-muted-foreground sm:ml-auto">
              {availabilityLabel(module)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps every route of a module: enforces entitlement (rendering the
 * upsell panel when the org lacks the module) and renders the module
 * header with its tab navigation from the registry.
 *
 * `navOverride` and `headerExtra` are optional, additive escape hatches —
 * every existing caller that omits them renders byte-identical to before.
 * A module whose tabs and their labels change with something other than
 * the URL (the Field/Station/Admin door from `useDoor()`) passes its own
 * computed `nav` array as `navOverride`; `headerExtra` takes a control
 * that belongs to the product (never a door switch: the frame owns that).
 *
 * The body carries the section rail slots (docs/shell.md, "What a product
 * rail is"): a record or workflow page registers its sections with
 * `useSections` and the frame draws them as a strip under the product
 * header or a rail beside the canvas; on an Admin path the admin menu is
 * the rail (`AdminRoutes`). Each slot renders nothing unless it is the
 * active variant for the live layout. Route tabs stay in the header.
 */
export default function ModuleShell({
  moduleId,
  children,
  navOverride,
  headerExtra,
}: {
  moduleId: string;
  children: ReactNode;
  navOverride?: ModuleNavItem[];
  headerExtra?: ReactNode;
}) {
  const pathname = usePathname();
  const { hasModule, isLoading } = useEntitlements();
  const mod = getModule(moduleId);

  if (!mod) {
    throw new Error(
      `ModuleShell: "${moduleId}" is not registered in config/modules.ts`
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasModule(mod.id)) {
    return <ModuleLocked module={mod} />;
  }

  const stage = stageLabel[mod.stage];
  const nav = navOverride ?? mod.nav;
  const activeHref = activeNavHref(nav, pathname);
  const adminRail = isAdminPath(pathname, [mod.basePath]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-background">
        {/* Wraps on a phone: a header control (the sync pill) drops to its
            own line rather than pushing the page sideways. */}
        <div className={cn("mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-5 sm:px-6", adminRail && "pb-4")}>
          <ModuleIcon module={mod} size="md" />
          <h1 className="font-serif text-xl font-bold text-foreground">
            {mod.name}
          </h1>
          {stage && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stage}
            </span>
          )}
          {headerExtra && <div className="ml-auto max-w-full">{headerExtra}</div>}
        </div>
        {!adminRail && (
        // On a phone the tabs wrap to a second line instead of scrolling
        // sideways, so every tab is in sight; from `sm` they keep one line.
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-x-1 px-4 pt-3 sm:flex-nowrap sm:overflow-x-auto sm:px-6">
          {nav.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                style={active ? { borderBottomColor: mod.accent } : undefined}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </Link>
            );
          })}
        </nav>
        )}
      </header>
      <SectionRailProvider>
        {adminRail && <AdminRoutes name={mod.name} nav={nav} activeHref={activeHref} />}
        <SectionRail variant="strip" />
        <div className="flex flex-1">
          <SectionRail variant="rail" />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </SectionRailProvider>
    </div>
  );
}
