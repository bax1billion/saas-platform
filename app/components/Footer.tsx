import EarlyAccessButton from "./EarlyAccessButton";
import HeroVisualLoader from "./HeroVisualLoader";
import { siteConfig } from "@/config/site";

export default function Footer() {
  return (
    <footer id="cta" className="bg-brand-dark py-16">
      <div className="mx-auto max-w-6xl px-6">
        {/* 3D visual — mobile only (hidden on desktop where it's in the hero) */}
        <div className="mb-8 block lg:hidden">
          <HeroVisualLoader />
        </div>

        {/* CTA band */}
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold text-white sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/70">
            Join teams who run their work in one place. Start your trial today.
          </p>
          <EarlyAccessButton
            source="FOOTER"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Start my free trial
          </EarlyAccessButton>
        </div>

        {/* Footer links */}
        <div className="mt-16 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="font-serif text-sm font-bold text-white/80">
              {siteConfig.company.brandName}
            </span>
            <div className="flex gap-6 text-sm text-white/50">
              {siteConfig.nav.footer.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-white/80"
                >
                  {item.label}
                </a>
              ))}
              <a href={`mailto:${siteConfig.company.supportEmail}`} className="transition-colors hover:text-white/80">
                Contact
              </a>
            </div>
            <span className="text-sm text-white/40">
              &copy; {new Date().getFullYear()} {siteConfig.company.legalName}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
