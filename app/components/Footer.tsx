import HeroVisualLoader from "./HeroVisualLoader";
import LandingCta from "./LandingCta";
import { siteConfig } from "@/config/site";
import { landing } from "@/config/landing";

export default function Footer({ showCta = true }: { showCta?: boolean }) {
  const { footerCta } = landing;

  return (
    <footer id="cta" className="bg-brand-dark py-16">
      <div className="mx-auto max-w-6xl px-6">
        {showCta && (
          <>
            {/* Hero visual — mobile only (hidden on desktop where it's in the hero) */}
            <div className="mb-8 block lg:hidden">
              <HeroVisualLoader />
            </div>

            {/* CTA band */}
            <div className="text-center">
              <h2 className="font-serif text-3xl font-bold text-brand-dark-foreground sm:text-4xl">
                {footerCta.headline}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-lg text-brand-dark-foreground/70">
                {footerCta.subheadline}
              </p>
              <LandingCta
                cta={footerCta.cta}
                source="FOOTER"
                className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              />
            </div>
          </>
        )}

        {/* Footer links */}
        <div
          className={`${showCta ? "mt-16 border-t border-brand-dark-foreground/10 pt-8" : ""}`}
        >
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="font-serif text-sm font-bold text-brand-dark-foreground/80">
              {siteConfig.company.brandName}
            </span>
            <div className="flex gap-6 text-sm text-brand-dark-foreground/50">
              {siteConfig.nav.footer.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-brand-dark-foreground/80"
                >
                  {item.label}
                </a>
              ))}
              <a
                href={`mailto:${siteConfig.company.supportEmail}`}
                className="transition-colors hover:text-brand-dark-foreground/80"
              >
                Contact
              </a>
            </div>
            <span className="text-sm text-brand-dark-foreground/40">
              &copy; {new Date().getFullYear()} {siteConfig.company.legalName}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
