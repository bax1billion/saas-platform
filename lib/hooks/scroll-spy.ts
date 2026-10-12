/**
 * Scroll spy math (docs/shell.md, Section rail). Pure, so the rules are
 * tested without a DOM; `useScrollSpy` owns the observer.
 */

/**
 * A CSS custom property comes back as raw text from `getPropertyValue`, so
 * only a plain `px` value is readable; `calc()` or `env()` fall back on
 * purpose, which is why the bar heights are kept as plain pixels.
 */
export function readPx(raw: string | null | undefined, fallback: number): number {
  const text = (raw ?? "").trim();
  if (!text.endsWith("px")) return fallback;
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface MarginInput {
  topBarPx: number;
  railPx: number;
  viewportPx: number;
  /** How much of the viewport the reading band covers. */
  bandRatio?: number;
  gapPx?: number;
}

/**
 * The reading band starts just under the sticky bars and is `bandRatio` of
 * the viewport tall, the same feel as the `-15% / -70%` margins the first
 * per-module rails used.
 */
export function computeRootMargin({ topBarPx, railPx, viewportPx, bandRatio = 0.15, gapPx = 8 }: MarginInput): string {
  const top = Math.round(topBarPx + railPx + gapPx);
  const band = Math.max(48, Math.round(viewportPx * bandRatio));
  const bottom = Math.max(0, Math.round(viewportPx - top - band));
  return `-${top}px 0px -${bottom}px 0px`;
}

/**
 * The first section in document order that touches the band wins. When
 * nothing does (a gap between sections) the previous answer stands; when
 * that is gone the first section is active.
 */
export function pickActiveId(order: readonly string[], inBand: ReadonlySet<string>, previous: string | null): string | null {
  for (const id of order) if (inBand.has(id)) return id;
  if (previous !== null && order.includes(previous)) return previous;
  return order[0] ?? null;
}

/** A short last section can never reach the band; at the bottom of the page it wins. */
export function isAtBottom(m: { scrollTop: number; clientHeight: number; scrollHeight: number }, slackPx = 2): boolean {
  return m.scrollTop + m.clientHeight >= m.scrollHeight - slackPx;
}
