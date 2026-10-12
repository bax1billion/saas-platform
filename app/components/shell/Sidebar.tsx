"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Settings } from "lucide-react";
import { shellPlaces, shellSidebarSections } from "@/config/shell";
import { arcAccent, isPreview, type ModuleDef } from "@/lib/modules";
import { moduleGroups } from "@/lib/modules/groups";
import type { SidebarState } from "@/lib/hooks/layout-mode";
import { canManageOrg } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuth } from "../AuthContext";
import { useEntitlements } from "../EntitlementsContext";
import FlagIt from "../FlagIt";
import ModuleIcon from "../ModuleIcon";
import { Mark, Wordmark } from "../Wordmark";
import { placeIcon } from "./place-icons";
import SidebarToggle from "./SidebarToggle";

function NavLink({
  href,
  active,
  compact,
  accent,
  children,
}: {
  href: string;
  active: boolean;
  compact: boolean;
  /** The active product's accent, drawn as the underline only. */
  accent?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex rounded-lg text-sm font-medium transition-colors",
        compact ? "min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-[11px] leading-tight" : "min-h-10 items-center gap-3 px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {children}
      {active && accent && (
        <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full" style={{ backgroundColor: accent }} />
      )}
    </Link>
  );
}

function SectionLabel({ children, compact, group }: { children: ReactNode; compact: boolean; group?: string }) {
  if (compact) {
    // Group headers become thin dividers in the group colour; the name rides on title.
    return (
      <div
        role="separator"
        title={String(children)}
        className="mx-2 mt-4 mb-1 h-1 rounded-full bg-sidebar-border"
        style={group ? { backgroundColor: arcAccent(group) } : undefined}
      />
    );
  }
  return (
    <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
      {children}
    </div>
  );
}

/**
 * The global sidebar in its two visible states (docs/shell.md). FULL is the
 * rail the first shell drew, with the places on top. COMPACT keeps
 * every item reachable as an icon with a short label and never disappears
 * on a desk; the phone layout hides it and the floating toolbar takes over.
 * Group colours mark headers only; a product accent only underlines the
 * active product.
 */
export default function Sidebar({ state }: { state: SidebarState }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { org, hasModule } = useEntitlements();
  const manager = canManageOrg(user?.groups);
  if (state === "hidden") return null;
  const compact = state === "compact";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  const moduleLink = (m: ModuleDef) => {
    const entitled = hasModule(m.id);
    const active = isActive(m.basePath);
    return (
      <NavLink key={m.id} href={m.basePath} active={active} compact={compact} accent={m.accent}>
        <ModuleIcon module={m} size="sm" onDark />
        <span className={cn("truncate", compact ? "max-w-full" : "flex-1", !entitled && "text-sidebar-foreground/70")}>{m.name}</span>
        {!entitled && !compact && (
          <span className="rounded-full border border-sidebar-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {isPreview(m) ? "Preview" : "Add-on"}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      id="global-sidebar"
      aria-label="Main"
      data-state={state}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar p-3 print:hidden",
        compact ? "w-[var(--sidebar-compact-w)] px-2" : "w-60"
      )}
    >
      <div className={cn("py-2", compact ? "flex justify-center" : "px-3")}>
        {compact ? (
          <Link href="/dashboard" aria-label="Home" className="flex h-11 w-11 items-center justify-center text-sidebar-accent-foreground">
            <Mark />
          </Link>
        ) : (
          <Wordmark href="/dashboard" className="text-sidebar-accent-foreground" />
        )}
      </div>

      {org && !compact && (
        <div className="mt-3 truncate rounded-lg bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground">
          <span className="block text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Organization</span>
          <span className="block truncate font-medium text-sidebar-accent-foreground">{org.name}</span>
        </div>
      )}

      <nav aria-label="Places" className="mt-4 space-y-0.5">
        {shellPlaces.map((p) => {
          const Icon = placeIcon(p.icon);
          return (
            <NavLink key={p.id} href={p.href} active={isActive(p.href)} compact={compact}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{p.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <nav aria-label="Products" className="mt-2 flex-1 overflow-y-auto">
        {moduleGroups.map(([label, mods]) => {
          // Members see the modules their organization has. Admins and operators
          // also see the rest of the lineup with a status chip, never a lock
          // or a price in the rail.
          const shown = mods.filter((m) => hasModule(m.id) || manager);
          if (shown.length === 0) return null;
          return (
            <div key={label}>
              <SectionLabel compact={compact} group={label}>
                {label}
              </SectionLabel>
              {shown.map(moduleLink)}
            </div>
          );
        })}

        {shellSidebarSections.map((section) => (
          <div key={section.label}>
            <SectionLabel compact={compact}>{section.label}</SectionLabel>
            {section.items.map((item) => {
              const Icon = placeIcon(item.icon);
              return (
                <NavLink key={item.href} href={item.href} active={isActive(item.href)} compact={compact}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{compact ? (item.shortLabel ?? item.label) : item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}

        <SectionLabel compact={compact}>Settings</SectionLabel>
        <NavLink href="/settings" active={pathname === "/settings"} compact={compact}>
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">Organization</span>
        </NavLink>
        {manager && (
          <NavLink href="/settings/billing" active={isActive("/settings/billing")} compact={compact}>
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="truncate">Billing</span>
          </NavLink>
        )}
      </nav>

      <div className="mt-4 border-t border-sidebar-border pt-3">
        {/* Flag it on every screen: the shell owns it so testers never hunt for it. */}
        <div className={cn("mb-2", compact ? "flex justify-center" : "px-3")}>
          <FlagIt
            iconOnly={compact}
            className={cn(
              "border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              compact ? "h-11 w-11 justify-center p-0" : "w-full justify-center"
            )}
          />
        </div>
        {!compact && (
          <div className="mb-2 flex items-center gap-3 px-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
              {initial}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">{user?.email}</span>
          </div>
        )}
        <SidebarToggle state={state} />
      </div>
    </aside>
  );
}
