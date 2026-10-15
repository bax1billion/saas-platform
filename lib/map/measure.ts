/**
 * The map's distance tool: straight-line (great-circle) distance between
 * two points, in feet. Pure, so the mobile app can reuse it. A hose lay or
 * a walk follows the ground and is longer; the readout says "straight line".
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;
export const FEET_PER_METRE = 1 / 0.3048;
export const FEET_PER_MILE = 5280;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Haversine distance in metres. Accurate to well under a foot at street scale. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceFeet(a: LatLng, b: LatLng): number {
  return distanceMetres(a, b) * FEET_PER_METRE;
}

/** "248 ft", "12,400 ft (2.35 mi)". Whole feet; miles added past one mile. */
export function formatFeet(feet: number): string {
  const ft = Math.round(feet);
  const text = `${ft.toLocaleString("en-US")} ft`;
  return ft >= FEET_PER_MILE ? `${text} (${(ft / FEET_PER_MILE).toFixed(2)} mi)` : text;
}

/** Halfway along the line, where the readout sits. Fine at map scale (not across the antimeridian). */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
}

/** The readout for a measured line: its length and where the tag sits. Null until the line has its two ends. */
export function measureTag(line: { type: "LineString"; coordinates: number[][] } | null | undefined): { feet: number; text: string; at: [number, number] } | null {
  if (!line || line.coordinates.length < 2) return null;
  const [a, b] = [line.coordinates[0], line.coordinates[line.coordinates.length - 1]];
  const from = { longitude: a[0], latitude: a[1] };
  const to = { longitude: b[0], latitude: b[1] };
  const feet = distanceFeet(from, to);
  const mid = midpoint(from, to);
  return { feet, text: `${formatFeet(feet)} straight line`, at: [mid.longitude, mid.latitude] };
}

/** The line and its two ends as GeoJSON, for the map's measure layers. */
export function measureGeoJson(a: LatLng | null, b: LatLng | null) {
  const features: {
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: [number, number][] };
  }[] = [];
  const pt = (p: LatLng): [number, number] => [p.longitude, p.latitude];
  if (a) features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pt(a) } });
  if (b) features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pt(b) } });
  if (a && b) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [pt(a), pt(b)] } });
  return { type: "FeatureCollection" as const, features };
}
