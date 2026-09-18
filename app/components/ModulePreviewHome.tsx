"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getModule, isPreview } from "@/lib/modules";
import ModuleIcon from "./ModuleIcon";

/**
 * Landing page for a module that ships routes before it ships features
 * (`stage: "planned"` add-on — a *preview*, docs/modules.md). Renders the
 * registry's marketing copy as an honest build-state page: each bullet is
 * a planned capability card with a dashed TODO badge, nothing reads or
 * writes data, and the module is navigable and demoable from day one.
 *
 * Replace with a real `modules/<id>/components/ModuleHome.tsx` (the
 * module-home pattern in docs/adding-a-module.md §3: live stats + Live/TODO
 * cards) the moment the first view lands.
 */
export default function ModulePreviewHome({ moduleId }: { moduleId: string }) {
  const mod = getModule(moduleId);
  if (!mod) {
    throw new Error(`ModulePreviewHome: "${moduleId}" is not registered in config/modules.ts`);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <ModuleIcon module={mod} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-bold text-foreground">{mod.name}</h2>
              {isPreview(mod) && (
                <span className="rounded-full border border-dashed border-warning/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                  Preview · not yet built
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--module-accent)" }}>
              {mod.tagline}
            </p>
          </div>
        </div>
        <Link
          href={`/modules/${mod.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Read the plan <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-6 max-w-3xl text-lg leading-relaxed text-foreground/70">{mod.marketing.headline}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {mod.marketing.bullets.map((b, i) => (
          <div
            key={b}
            className="rounded-xl border border-border bg-background p-5"
            style={i === 0 ? { borderTopColor: "var(--module-accent)", borderTopWidth: 3 } : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="rounded-full border border-dashed border-warning/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                TODO · spec&apos;d
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{b}</p>
          </div>
        ))}
      </div>

      {mod.marketing.body?.map((p) => (
        <p key={p} className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {p}
        </p>
      ))}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        This module is a placeholder: the door exists so the platform reads complete and an operator can grant
        access for a pilot, but nothing here stores data yet. Views land one at a time and replace these cards
        with live ones.
      </p>
    </div>
  );
}
