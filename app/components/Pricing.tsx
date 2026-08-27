import { tiers } from "@/config/pricing";
import { landing } from "@/config/landing";
import { addonModules } from "@/lib/modules";
import ModuleIcon from "./ModuleIcon";

export default function Pricing() {
  const copy = landing.pricing;

  return (
    <section id="pricing" className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          {copy.headline}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-foreground/60">
          {copy.subheadline}
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl p-8 text-left ${
                tier.highlighted
                  ? "border-2 border-primary bg-muted"
                  : "border border-foreground/10 bg-muted"
              }`}
            >
              <h3
                className={`text-sm font-semibold uppercase tracking-wide ${
                  tier.highlighted ? "text-primary" : "text-foreground/50"
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
              <p className="mt-3 text-sm text-foreground/60">
                {tier.description}
              </p>
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

        {addonModules.length > 0 && (
          <div className="mt-16">
            <h3 className="font-serif text-2xl font-bold text-foreground">
              {copy.addOnsHeadline}
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-foreground/60">
              {copy.addOnsSubheadline}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {addonModules.map((m) => (
                <a
                  key={m.id}
                  href={`/modules/${m.id}`}
                  className="flex items-center gap-4 rounded-xl border border-foreground/10 bg-muted p-5 text-left transition-shadow hover:shadow-md"
                >
                  <ModuleIcon module={m} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-lg font-bold text-foreground">
                      {m.name}
                    </div>
                    <div className="truncate text-sm text-foreground/60">
                      {m.tagline}
                    </div>
                  </div>
                  {m.price && (
                    <div className="text-right">
                      <div className="font-serif text-xl font-bold text-foreground">
                        {m.price}
                      </div>
                      <div className="text-xs text-foreground/50">/mo</div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
