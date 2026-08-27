import { landing } from "@/config/landing";

export default function PainPoints() {
  const { painPoints } = landing;

  return (
    <section className="bg-muted py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          {painPoints.headline}
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-foreground/60">
          {painPoints.subheadline}
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {painPoints.cards.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className="rounded-xl bg-background p-6 shadow-sm"
              >
                <div className="mb-4">
                  <Icon
                    className={`h-8 w-8 ${point.tone ?? "text-primary"}`}
                    strokeWidth={1.5}
                  />
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
