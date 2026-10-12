import type { ReactNode } from "react";

/** A place's canvas: one heading, one column, Field-sized text. */
export function PlacePage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="font-serif text-2xl font-bold text-foreground">{title}</h1>
      {lead && <p className="mt-1 text-[17px] text-muted-foreground">{lead}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

/**
 * An honest empty state: says what will be here and, when the product
 * tracks it, which ticket brings it. A control that only shows a message
 * never ships; a place that is not built yet says so instead.
 */
export function HonestEmpty({ children, ticket }: { children: ReactNode; ticket?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-6 text-[17px] leading-relaxed text-muted-foreground">
      <p>{children}</p>
      {ticket && <p className="mt-2 text-sm">Ticket {ticket}.</p>}
    </div>
  );
}
