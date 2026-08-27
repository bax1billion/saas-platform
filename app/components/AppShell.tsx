"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  Lock,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { activeModules, getModuleByPath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";
import ModuleIcon from "./ModuleIcon";
import PastDueBanner from "./PastDueBanner";
import { Toaster } from "@/components/ui/sonner";

type NavLinkProps = {
  href: string;
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
};

function NavLink({ href, active, children, onClick }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
      {children}
    </div>
  );
}

/**
 * Authenticated app shell: dark sidebar (foundation sidebar tokens) with
 * Dashboard, one entry per module from the registry (locked ones still
 * link — the module sells itself), Settings, and the user menu.
 *
 * Exposes the current module's accent as `--module-accent` on the root so
 * module UI can tint itself without knowing which module it is in.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, handleSignOut } = useAuth();
  const { org, hasModule, status } = useEntitlements();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentModule = getModuleByPath(pathname);
  const shellStyle = {
    "--module-accent": currentModule?.accent ?? "var(--primary)",
  } as CSSProperties;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const close = () => setMobileOpen(false);
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={close}
        className="flex items-center gap-2.5 px-3 py-2 font-serif text-lg font-bold text-sidebar-accent-foreground"
      >
        <img
          src="/logo.png"
          alt={siteConfig.product.name}
          width={28}
          height={28}
          className="h-7 w-7 rounded-md"
        />
        {siteConfig.product.name}
      </Link>

      {org && (
        <div className="mt-3 truncate rounded-lg bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground">
          <span className="block text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            Organization
          </span>
          <span className="block truncate font-medium text-sidebar-accent-foreground">
            {org.name}
          </span>
        </div>
      )}

      <nav className="mt-4 flex-1 overflow-y-auto">
        <NavLink href="/dashboard" active={isActive("/dashboard")} onClick={close}>
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </NavLink>

        {activeModules.length > 0 && (
          <>
            <SectionLabel>Modules</SectionLabel>
            {activeModules.map((m) => {
              const entitled = hasModule(m.id);
              return (
                <NavLink
                  key={m.id}
                  href={m.basePath}
                  active={isActive(m.basePath)}
                  onClick={close}
                >
                  <ModuleIcon module={m} size="sm" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {!entitled && (
                    <Lock className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                  )}
                </NavLink>
              );
            })}
          </>
        )}

        <SectionLabel>Settings</SectionLabel>
        <NavLink
          href="/settings"
          active={pathname === "/settings"}
          onClick={close}
        >
          <Settings className="h-4 w-4" />
          Organization
        </NavLink>
        <NavLink
          href="/settings/billing"
          active={isActive("/settings/billing")}
          onClick={close}
        >
          <CreditCard className="h-4 w-4" />
          Billing
        </NavLink>
      </nav>

      <div className="mt-4 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-3 px-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">
            {user?.email}
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted" style={shellStyle}>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-sidebar p-3 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-brand-dark/70"
            onClick={close}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar p-3 shadow-xl">
            <button
              onClick={close}
              className="absolute right-3 top-3 rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-foreground hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-serif text-base font-bold text-foreground">
            {currentModule?.name ?? siteConfig.product.name}
          </span>
        </header>

        {status === "PAST_DUE" && <PastDueBanner />}

        <main className="flex-1">{children}</main>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
