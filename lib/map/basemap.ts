/**
 * The platform's basemaps, as pure functions so they are tested without a
 * browser. The maps are Amazon Location's published styles (the current
 * Maps API: no per-environment map resource); requests are signed with the
 * signed-in user's credentials or carry the public key (./location).
 */
export type Basemap = "streets" | "satellite";

/** The styles the Maps API publishes. */
export type MapStyle = "Standard" | "Monochrome" | "Hybrid" | "Satellite";

export type ColorScheme = "Light" | "Dark";

export interface StyleOptions {
  /** Light unless the app says otherwise; only the vector styles have a dark variant. */
  colorScheme?: ColorScheme;
  /** Hillshade over the streets, for a crew reading a slope; the vector styles only. */
  terrain?: boolean;
}

/** Satellite is the imagery with the streets' labels and roads over it, as the service publishes it. */
export const STYLE_FOR_BASEMAP: Record<Basemap, MapStyle> = { streets: "Standard", satellite: "Hybrid" };

const VECTOR_STYLES: ReadonlySet<MapStyle> = new Set(["Standard", "Monochrome"]);

/** A published style's descriptor, with the options the vector styles take. */
export function styleUrl(region: string, style: MapStyle, opts: StyleOptions = {}): string {
  const params = new URLSearchParams();
  if (VECTOR_STYLES.has(style)) {
    params.set("color-scheme", opts.colorScheme ?? "Light");
    if (opts.terrain) params.set("terrain", "Hillshade");
  }
  const query = params.toString();
  return `https://maps.geo.${region}.amazonaws.com/v2/styles/${style}/descriptor${query ? `?${query}` : ""}`;
}

/** The descriptor for one of the platform's basemaps. */
export const basemapStyleUrl = (region: string, basemap: Basemap, opts?: StyleOptions) =>
  styleUrl(region, STYLE_FOR_BASEMAP[basemap], opts);
