import { landing } from "@/config/landing";

export default function Features() {
  const { features } = landing;

  return (
    <section id="features" className="bg-muted py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
            {features.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground/60">
            {features.subheadline}
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {features.cards.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-foreground/5 bg-background p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4">
                  <Icon className="h-8 w-8 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="font-serif text-xl font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-relaxed text-foreground/60">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
