import EarlyAccessButton from "./EarlyAccessButton";
import type { LandingCta as LandingCtaDef } from "@/config/landing";

/**
 * Renders a landing CTA from config: a link when `href` is set, otherwise
 * the early-access modal trigger tagged with the given lead source.
 */
export default function LandingCta({
  cta,
  source,
  className,
}: {
  cta: LandingCtaDef;
  source: string;
  className: string;
}) {
  if (cta.href) {
    return (
      <a href={cta.href} className={className}>
        {cta.label}
      </a>
    );
  }
  return (
    <EarlyAccessButton source={source} className={className}>
      {cta.label}
    </EarlyAccessButton>
  );
}
