import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Sprites from a catalog (docs/map-engine.md § 4.2): every symbol
 * a map draws is an SVG string the product supplies, rasterised on the
 * device at the screen's pixel ratio and added to the map as an image, so
 * a new symbol is a new entry and nothing is uploaded or deployed. Images
 * are lost with the style, so the engine adds them again after every
 * style load.
 */
export interface SpriteEntry {
  /** `<owner>.<kind>[.<variant>]`, the value a feature's icon property carries. */
  id: string;
  /** A complete `<svg>` with a square viewBox. */
  svg: string;
  /** The drawn size in CSS pixels at icon-size 1. */
  size: number;
}

/** The id a feature's icon property carries. */
export const spriteId = (owner: string, kind: string, variant?: string) => (variant ? `${owner}.${kind}.${variant}` : `${owner}.${kind}`);

export const spriteIds = (entries: readonly SpriteEntry[]) => entries.map((e) => e.id);

/** 2 on a high-density screen, else 1; MapLibre picks the icon size by it. */
export function devicePixelRatioFor(win: { devicePixelRatio?: number } | undefined): 1 | 2 {
  return (win?.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1;
}

/** The SVG as pixels at `pixelRatio`, drawn through an image element (what every browser can rasterise). */
export async function rasterise(entry: SpriteEntry, pixelRatio: number): Promise<ImageData> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(entry.svg)}`;
  await img.decode();
  const px = Math.round(entry.size * pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device cannot draw map symbols.");
  ctx.drawImage(img, 0, 0, px, px);
  return ctx.getImageData(0, 0, px, px);
}

/**
 * Adds every entry to the map at the given pixel ratio, replacing an image
 * the map already has under that id (a custom symbol edited since). A
 * symbol that fails to draw is skipped and reported, never thrown: the
 * rest of the map still draws.
 */
export async function addSprites(map: MapLibreMap, entries: readonly SpriteEntry[], pixelRatio: number, onProblem?: (id: string, message: string) => void): Promise<void> {
  for (const entry of entries) {
    try {
      const image = await rasterise(entry, pixelRatio);
      if (map.hasImage(entry.id)) map.updateImage(entry.id, image);
      else map.addImage(entry.id, image, { pixelRatio });
    } catch (err) {
      onProblem?.(entry.id, err instanceof Error ? err.message : "This symbol did not draw.");
    }
  }
}
