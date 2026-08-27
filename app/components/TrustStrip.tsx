import { landing } from "@/config/landing";

/**
 * Credibility strip: standards supported, integrations, customer logos —
 * whatever the product's defensible one-line signals are (config/landing.ts).
 */
export default function TrustStrip() {
  const { trust } = landing;

  return (
    <section className="border-y border-foreground/5 bg-muted py-16">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
          {trust.headline}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-foreground/60">
          {trust.subheadline}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {trust.items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-foreground/10 bg-background px-5 py-2 text-sm font-medium text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
