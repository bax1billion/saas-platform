import HeroVisualLoader from "./HeroVisualLoader";
import LandingCta from "./LandingCta";
import { siteConfig } from "@/config/site";
import { landing } from "@/config/landing";

export default function Hero() {
  const { hero } = landing;
  const headlineLines = hero.headline.split("\n");

  return (
    <section className="relative overflow-hidden bg-brand-dark">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-brand-dark to-primary/20" />

      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-primary">
              {hero.eyebrow ?? siteConfig.product.name}
            </span>
            <h1 className="mt-6 font-serif text-4xl font-bold leading-tight text-brand-dark-foreground sm:text-5xl lg:text-6xl">
              {headlineLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < headlineLines.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-brand-dark-foreground/80 sm:text-xl">
              {hero.subheadline}
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <LandingCta
                cta={hero.primaryCta}
                source="HOMEPAGE_HERO"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              />
              <LandingCta
                cta={hero.secondaryCta}
                source="HOMEPAGE_HERO"
                className="inline-flex items-center justify-center rounded-lg border border-brand-dark-foreground/30 px-6 py-3 text-base font-semibold text-brand-dark-foreground transition-colors hover:border-brand-dark-foreground/60 hover:bg-brand-dark-foreground/10"
              />
            </div>
          </div>
          <div className="hidden lg:block">
            <HeroVisualLoader />
          </div>
        </div>
      </div>
    </section>
  );
}
