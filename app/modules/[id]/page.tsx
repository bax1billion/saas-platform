import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import EarlyAccessModal from "@/app/components/EarlyAccessModal";
import AuthModal from "@/app/components/AuthModal";
import EarlyAccessButton from "@/app/components/EarlyAccessButton";
import ModuleIcon from "@/app/components/ModuleIcon";
import { modules, getModule, availabilityLabel } from "@/lib/modules";
import { pageTitle, absoluteUrl } from "@/config/site";

type Params = { id: string };

export function generateStaticParams(): Params[] {
  return modules.map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = getModule(id);
  if (!m) return {};
  return {
    title: pageTitle(m.name),
    description: m.description,
    alternates: { canonical: `/modules/${m.id}` },
    openGraph: {
      title: pageTitle(m.name),
      description: m.description,
      url: absoluteUrl(`/modules/${m.id}`),
      type: "website",
    },
  };
}

/**
 * Marketing detail page for one module — rendered from config/modules.ts.
 * Coming-soon modules get the same page with a softer CTA.
 */
export default async function ModulePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const m = getModule(id);
  if (!m) notFound();

  const comingSoon = m.availability === "coming-soon";

  return (
    <>
      <Navbar />
      <section className="relative overflow-hidden bg-brand-dark">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(60% 80% at 80% 20%, ${m.accent}, transparent)`,
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <a
            href="/#modules"
            className="text-sm font-medium text-brand-dark-foreground/60 transition-colors hover:text-brand-dark-foreground"
          >
            &larr; All modules
          </a>
          <div className="mt-6 flex items-center gap-4">
            <ModuleIcon module={m} size="lg" />
            <span className="rounded-full border border-brand-dark-foreground/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark-foreground/80">
              {availabilityLabel(m)}
            </span>
          </div>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-tight text-brand-dark-foreground sm:text-5xl">
            {m.name}
          </h1>
          <p
            className="mt-3 text-xl font-medium"
            style={{ color: m.accent }}
          >
            {m.tagline}
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-brand-dark-foreground/80">
            {m.marketing.headline}
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <EarlyAccessButton
              source="HOMEPAGE_PRICING"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {comingSoon ? "Notify me when it ships" : `Get ${m.name}`}
            </EarlyAccessButton>
            <a
              href="/#pricing"
              className="inline-flex items-center justify-center rounded-lg border border-brand-dark-foreground/30 px-6 py-3 text-base font-semibold text-brand-dark-foreground transition-colors hover:border-brand-dark-foreground/60 hover:bg-brand-dark-foreground/10"
            >
              See pricing
            </a>
          </div>
        </div>
      </section>

      <section className="bg-background py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="font-serif text-3xl font-bold text-foreground">
              What you get
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-foreground/60">
              {m.description}
            </p>
            {m.marketing.body?.map((p, i) => (
              <p key={i} className="mt-4 leading-relaxed text-foreground/70">
                {p}
              </p>
            ))}
          </div>
          <ul className="space-y-4">
            {m.marketing.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 rounded-xl border border-foreground/5 bg-muted p-5"
              >
                <span
                  className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: m.accent }}
                />
                <span className="leading-relaxed text-foreground/80">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {m.nav.length > 0 && !comingSoon && (
        <section className="border-t border-foreground/5 bg-muted py-16">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Inside {m.name}
            </h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {m.nav.map((item) => (
                <span
                  key={item.href}
                  className="rounded-full border border-foreground/10 bg-background px-5 py-2 text-sm font-medium text-foreground"
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
      <EarlyAccessModal />
      <AuthModal />
    </>
  );
}
