import EarlyAccessButton from "./EarlyAccessButton";
import HeroVisualLoader from "./HeroVisualLoader";
import { siteConfig } from "@/config/site";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-dark">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-brand-dark to-primary/20" />

      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-primary">
              {siteConfig.product.name}
            </span>
            <h1 className="mt-6 font-serif text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Run your business.
              <br />
              All in one&nbsp;place.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-white/80 sm:text-xl">
              A modern workspace for growing teams. Bring your work, your
              people and your data together — and get more done with less
              overhead.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <EarlyAccessButton
                source="HOMEPAGE_HERO"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Get early access
              </EarlyAccessButton>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-base font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/10"
              >
                See how it works
              </a>
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
