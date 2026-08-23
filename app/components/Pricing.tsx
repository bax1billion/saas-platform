import { tiers } from '@/config/pricing';

export default function Pricing() {
  return (
    <section id="pricing" className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          Transparent pricing. No surprises.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-foreground/60">
          Every plan includes all core modules. Pick the scale that fits.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl p-8 text-left ${
                tier.highlighted
                  ? 'border-2 border-primary bg-muted'
                  : 'border border-foreground/10 bg-muted'
              }`}
            >
              <h3
                className={`text-sm font-semibold uppercase tracking-wide ${
                  tier.highlighted ? 'text-primary' : 'text-foreground/50'
                }`}
              >
                {tier.name}
              </h3>
              <div className="mt-4">
                <span className="font-serif text-4xl font-bold text-foreground">
                  {tier.price}
                </span>
                <span className="text-foreground/50">/mo</span>
              </div>
              <p className="mt-3 text-sm text-foreground/60">{tier.description}</p>
              <ul className="mt-6 space-y-2">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground/70"
                  >
                    <span className="mt-0.5 text-primary">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
