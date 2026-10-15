/**
 * What a map picture is, shared by whatever draws one (a product's own
 * marks over the basemap) and the Save as PDF dialog that prints it.
 */
export interface Snapshot {
  dataUrl: string;
  width: number;
  height: number;
  /** Sensitive items in view that were left out of this copy. */
  leftOut: number;
}

/** A theme token's current value, for drawing on a canvas or a map that cannot read CSS variables. */
export function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** A token's colour as six-digit hex, for a library that takes nothing else; the fallback when the token is not hex. */
export function themeHex(name: string, fallback: `#${string}`): `#${string}` {
  const hex = themeColor(name, "").trim().replace("#", "");
  const full = hex.length === 3 || hex.length === 4 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) return fallback;
  return `#${full.slice(0, 6).toLowerCase()}`;
}

/** A token's colour at `alpha`, as rgba(): the theme stays the one place colours are spelled out. */
export function themeColorAlpha(name: string, alpha: number, fallback: string): string {
  const hex = themeColor(name, "").replace("#", "");
  const full = hex.length === 3 || hex.length === 4 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) return fallback;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${alpha})`;
}
