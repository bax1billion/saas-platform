"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { getModule, availabilityLabel, type ModuleDef } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useEntitlements } from "./EntitlementsContext";
import ModuleIcon from "./ModuleIcon";

const stageLabel: Record<ModuleDef["stage"], string | null> = {
  ga: null,
  beta: "Beta",
  planned: "Preview",
};

function ModuleLocked({ module }: { module: ModuleDef }) {
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
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={`/subscribe?module=${module.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add {module.name}
            {module.price ? ` · ${module.price}/mo` : ""}
          </Link>
          <Link
            href={`/modules/${module.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Learn more
          </Link>
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {availabilityLabel(module)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps every route of a module: enforces entitlement (rendering the
 * upsell panel when the org lacks the module) and renders the module
 * header with its tab navigation from the registry.
 */
export default function ModuleShell({
  moduleId,
  children,
}: {
  moduleId: string;
  children: ReactNode;
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 pt-5">
          <ModuleIcon module={mod} size="md" />
          <h1 className="font-serif text-xl font-bold text-foreground">
            {mod.name}
          </h1>
          {stage && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stage}
            </span>
          )}
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 pt-3">
          {mod.nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
