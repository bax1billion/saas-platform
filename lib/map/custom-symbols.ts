/**
 * Organization-defined map symbols, part of the map engine (lib/map). A product's own
 * symbol types store the spec; this draws it.
 *
 * Regions have equipment a built-in catalog can't know about —
 * a flood-gate control, a drafting site, an avalanche beacon
 * cache. A department builds one from a shape, a colour and either 1–3
 * characters or a pictogram, plus a name.
 *
 * Deliberately *configuration, not upload*: the SVG is generated here from
 * validated parameters, so nothing a user types ever becomes markup (no
 * SVG-upload XSS, no S3/CDN pipeline, and every icon is legible at 20px by
 * construction). The stored fields are plain strings, and every one is
 * re-validated at render time — the database is not trusted.
 *
 * Pure and client-safe, like symbols.ts.
 */

export const CUSTOM_SHAPES = [
  "CIRCLE",
  "SQUARE",
  "TRIANGLE",
  "DIAMOND",
  "HEXAGON",
  "OCTAGON",
] as const;
export type CustomShape = (typeof CUSTOM_SHAPES)[number];

export const CUSTOM_SHAPE_LABEL: Record<CustomShape, string> = {
  CIRCLE: "Circle",
  SQUARE: "Square",
  TRIANGLE: "Triangle",
  DIAMOND: "Diamond",
  HEXAGON: "Hexagon",
  OCTAGON: "Octagon",
};

/** What a custom symbol is made of: the fields a product's symbol type stores
 *  that the drawing depends on. */
export interface CustomSymbolSpec {
  shape: string;
  color: string;
  glyphText?: string | null;
  pictogram?: string | null;
}

export const MAX_NAME_LENGTH = 40;
export const MAX_GLYPH_CHARS = 3;
/** Neutral grey for a stored colour that fails validation. */
export const FALLBACK_COLOR = "#6B7280";

/** Swatches offered in the builder. Any #RRGGBB is accepted; these are
 *  the ones that read well on the streets basemap. */
export const COLOR_PRESETS = [
  "#D14A2E",
  "#E8A33D",
  "#F2D024",
  "#2F7D4F",
  "#2E6DA4",
  "#6B4FA0",
  "#101A2B",
  "#FFFFFF",
] as const;

const INK = "#101A2B";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** A colour that is safe to put in markup: valid hex, else the fallback. */
export function safeColor(value: unknown): string {
  return isHexColor(value) ? value.toUpperCase() : FALLBACK_COLOR;
}

/** Black or white, whichever reads better on `bg` (WCAG relative
 *  luminance), so a glyph is never lost on its own fill. */
export function contrastColor(bg: string): string {
  const hex = safeColor(bg).slice(1);
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  // Crossover where black and white have equal contrast is ~0.179.
  return luminance > 0.179 ? "#101A2B" : "#FFFFFF";
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Trims to at most three characters, counting code points so an emoji is
 *  one character, not two halves of a surrogate pair. */
export function normalizeGlyphText(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value.trim()).slice(0, MAX_GLYPH_CHARS).join("");
}

interface Pictogram {
  key: string;
  label: string;
  /** Markup in the 32×32 box, drawn around (16,16), using `currentColor`. */
  svg: string;
}

const S = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

/** Hand-drawn, geometric, built to stay legible at 20px. Adding one is a
 *  code change only — the schema stores the key as a string. */
export const PICTOGRAMS: Pictogram[] = [
  { key: "drop", label: "Water", svg: `<path ${F} d="M16 6C16 6 9.5 13.5 9.5 18.5a6.5 6.5 0 0 0 13 0C22.5 13.5 16 6 16 6z"/>` },
  { key: "flame", label: "Fire", svg: `<path ${F} d="M16 5c1.2 4.6 6.2 6.6 6.2 12.2a6.2 6.2 0 0 1-12.4 0c0-2.2 1-3.8 2.4-5 .2 2 1 3 2.2 3.4C13.6 11.4 14 8 16 5z"/>` },
  { key: "bolt", label: "Electric", svg: `<path ${F} d="M18.5 4 9 17.5h6L13.5 28 23 14h-6z"/>` },
  { key: "medical", label: "Medical", svg: `<path ${F} d="M12.6 7h6.8v5.6H25v6.8h-5.6V25h-6.8v-5.6H7v-6.8h5.6z"/>` },
  { key: "alert", label: "Alert", svg: `<path ${F} d="M14.4 7h3.2l-.7 11.2h-1.8z"/><circle ${F} cx="16" cy="22.4" r="2"/>` },
  { key: "key", label: "Key", svg: `<circle ${S} cx="11.5" cy="16" r="4.5"/><path ${S} d="M16 16h10M22.5 16v4M26 16v3"/>` },
  { key: "arrow", label: "Direction", svg: `<path ${S} d="M6 16h18M17 9l7 7-7 7"/>` },
  { key: "star", label: "Star", svg: `<path ${F} d="m16 5.5 3.1 6.4 7 .9-5.1 4.9 1.3 7L16 21.2l-6.3 3.5 1.3-7-5.1-4.9 7-.9z"/>` },
  { key: "ladder", label: "Ladder", svg: `<path ${S} d="M10.5 5v22M21.5 5v22M10.5 10.5h11M10.5 16h11M10.5 21.5h11"/>` },
  { key: "tank", label: "Tank", svg: `<path ${F} d="M12.5 5h7v3h-7z"/><path ${F} d="M10 10.5a3 3 0 0 1 3-2.5h6a3 3 0 0 1 3 2.5V25a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z"/>` },
  { key: "home", label: "Building", svg: `<path ${F} d="M16 5.5 27 15.5h-3.2V26H8.2V15.5H5z"/>` },
  { key: "waves", label: "Flood", svg: `<path ${S} d="M5 12q2.75-3 5.5 0t5.5 0 5.5 0 5.5 0M5 19q2.75-3 5.5 0t5.5 0 5.5 0 5.5 0"/>` },
  { key: "person", label: "Person", svg: `<circle ${F} cx="16" cy="10.5" r="4.5"/><path ${F} d="M7 26a9 9 0 0 1 18 0z"/>` },
];

const PICTOGRAM_BY_KEY = new Map(PICTOGRAMS.map((p) => [p.key, p]));

export function isPictogramKey(value: unknown): value is string {
  return typeof value === "string" && PICTOGRAM_BY_KEY.has(value);
}

interface ShapeGeometry {
  markup: (fill: string) => string;
  /** Where the glyph is centred and how much room it has. */
  cx: number;
  cy: number;
  scale: number;
}

const OUTLINE = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;

const SHAPES: Record<CustomShape, ShapeGeometry> = {
  CIRCLE: { markup: (f) => `<circle cx="16" cy="16" r="12" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 16, scale: 0.7 },
  SQUARE: { markup: (f) => `<rect x="4.5" y="4.5" width="23" height="23" rx="3" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 16, scale: 0.72 },
  TRIANGLE: { markup: (f) => `<path d="M16 3.5 30 28.5H2z" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 21.5, scale: 0.5 },
  DIAMOND: { markup: (f) => `<path d="M16 2.5 29.5 16 16 29.5 2.5 16z" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 16, scale: 0.5 },
  HEXAGON: { markup: (f) => `<path d="M16 3 27.3 9.5v13L16 29 4.7 22.5v-13z" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 16, scale: 0.68 },
  OCTAGON: { markup: (f) => `<path d="M11 4h10l7 7v10l-7 7H11l-7-7V11z" fill="${f}" ${OUTLINE}/>`, cx: 16, cy: 16, scale: 0.7 },
};

export function isCustomShape(value: unknown): value is CustomShape {
  return typeof value === "string" && (CUSTOM_SHAPES as readonly string[]).includes(value);
}

/** Inner markup (32×32 box) for a custom symbol. Every input is validated
 *  here, so an unknown shape, a hostile colour or a stray pictogram key
 *  degrades to a safe default instead of reaching the SVG. */
export function customSymbolInner(spec: CustomSymbolSpec): string {
  const shape = SHAPES[isCustomShape(spec.shape) ? spec.shape : "CIRCLE"];
  const fill = safeColor(spec.color);
  const ink = contrastColor(fill);
  let glyph = "";

  const picto = isPictogramKey(spec.pictogram) ? PICTOGRAM_BY_KEY.get(spec.pictogram) : undefined;
  if (picto) {
    glyph = `<g color="${ink}" transform="translate(${shape.cx} ${shape.cy}) scale(${shape.scale}) translate(-16 -16)">${picto.svg}</g>`;
  } else {
    const text = normalizeGlyphText(spec.glyphText);
    if (text) {
      const n = Array.from(text).length;
      const fontSize = (n === 1 ? 17 : n === 2 ? 13 : 10) * (shape.scale / 0.7);
      glyph = `<text x="${shape.cx}" y="${(shape.cy + fontSize * 0.35).toFixed(2)}" text-anchor="middle" font-size="${fontSize.toFixed(2)}" font-weight="700" fill="${ink}" font-family="Arial, Helvetica, sans-serif">${escapeXml(text)}</text>`;
    }
  }
  return shape.markup(fill) + glyph;
}

/** Complete `<svg>` for a custom symbol. */
export function customSymbolSvg(spec: CustomSymbolSpec, size: number): string {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${customSymbolInner(spec)}</svg>`;
}

/** Stand-in for a mark whose custom type can't be found (deleted from the
 *  database, or not loaded yet): a grey question-mark circle. */
export function unknownSymbolSvg(size: number): string {
  return customSymbolSvg({ shape: "CIRCLE", color: FALLBACK_COLOR, glyphText: "?" }, size);
}

export interface CustomSymbolInput {
  name: string;
  shape: string;
  color: string;
  glyphText: string;
  pictogram: string | null;
}

export type CustomSymbolErrors = Partial<Record<"name" | "shape" | "color" | "glyph", string>>;

/** Validates the builder form. `takenNames` are the names already in use
 *  (built-in and the org's other custom symbols); duplicates would make
 *  the legend ambiguous, so they're rejected case-insensitively. */
export function validateCustomSymbol(
  input: CustomSymbolInput,
  takenNames: Iterable<string>
): CustomSymbolErrors {
  const errors: CustomSymbolErrors = {};
  const name = input.name.trim();
  if (!name) {
    errors.name = "Give the symbol a name.";
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  } else {
    const lower = name.toLowerCase();
    for (const t of takenNames) {
      if (t.trim().toLowerCase() === lower) {
        errors.name = "A symbol with that name already exists.";
        break;
      }
    }
  }
  if (!isCustomShape(input.shape)) errors.shape = "Pick a shape.";
  if (!isHexColor(input.color)) errors.color = "Use a colour like #D14A2E.";
  if (!input.pictogram && !normalizeGlyphText(input.glyphText)) {
    errors.glyph = "Add 1–3 characters or pick a pictogram.";
  } else if (input.pictogram && !isPictogramKey(input.pictogram)) {
    errors.glyph = "Unknown pictogram.";
  }
  return errors;
}
