import { painPointIcons } from "./icons";
import type { LucideIcon } from "lucide-react";

const painPoints: {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    title: "Scattered tools",
    description:
      "Work spread across spreadsheets, shared drives and email chains. Finding the latest version takes longer than the work itself.",
    icon: painPointIcons.scatteredTools,
    color: "text-destructive",
  },
  {
    title: "Manual busywork",
    description:
      "Repetitive updates, copy-paste reporting and chasing status by hand eat hours out of every week.",
    icon: painPointIcons.manualBusywork,
    color: "text-warning",
  },
  {
    title: "No visibility",
    description:
      "No single view of who is doing what, what is on track, or what is quietly falling behind.",
    icon: painPointIcons.noVisibility,
    color: "text-warning",
  },
];

export default function PainPoints() {
  return (
    <section className="bg-muted py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          Spreadsheets and inboxes don&apos;t scale.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-foreground/60">
          When work lives everywhere, nothing gets the attention it needs. Your
          team deserves one reliable place to run on.
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {painPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className="rounded-xl bg-background p-6 shadow-sm"
              >
                <div className="mb-4">
                  <Icon className={`h-8 w-8 ${point.color}`} strokeWidth={1.5} />
                </div>
                <h3 className="font-serif text-lg font-bold text-foreground">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
