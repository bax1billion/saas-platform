import { landing } from "@/config/landing";
import { modules, availabilityLabel } from "@/lib/modules";
import ModuleIcon from "./ModuleIcon";

/**
 * Module showcase: one card per entry in config/modules.ts. Renders nothing
 * when the product has no modules registered yet.
 */
export default function Modules() {
  if (modules.length === 0) return null;
  const copy = landing.modules;

  return (
    <section id="modules" className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
            {copy.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground/60">
            {copy.subheadline}
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => {
            const comingSoon = m.availability === "coming-soon";
            return (
              <a
                key={m.id}
                href={`/modules/${m.id}`}
                className={`group relative flex flex-col rounded-xl border border-foreground/10 bg-muted p-6 transition-shadow hover:shadow-md ${
                  comingSoon ? "opacity-80" : ""
                }`}
                style={{ borderTopColor: m.accent, borderTopWidth: 3 }}
              >
                <div className="flex items-center justify-between">
                  <ModuleIcon module={m} size="lg" />
                  <span className="rounded-full border border-foreground/10 bg-background px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                    {availabilityLabel(m)}
                  </span>
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold text-foreground">
                  {m.name}
                </h3>
                <p className="mt-1 text-sm font-medium" style={{ color: m.accent }}>
                  {m.tagline}
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/60">
                  {m.description}
                </p>
                <span className="mt-4 text-sm font-semibold text-primary group-hover:underline">
                  {comingSoon ? "Read the plan →" : "Explore the module →"}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
