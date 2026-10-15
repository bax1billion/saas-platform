/**
 * The pure half of the address lookup: what a Places API result is and
 * how closely it matches a street address. Shared by the browser
 * (./geocode.ts, which signs the calls) and the locator Lambda that places
 * a record from its address, so it imports nothing from the browser or "@/".
 */

/**
 * How closely a result matches a street address. The provider answers a
 * house number it can't find with the street or the town instead, so the
 * list has to say which one the user is looking at.
 *
 * - `exact`: the provider has this address as a known point.
 * - `interpolated`: the number is estimated along the street between
 *   known addresses; usually close, not rooftop.
 * - `place`: a named business or landmark.
 * - `street`: the street, without the house number.
 * - `area`: a town, ZIP code, county or region.
 */
export type MatchPrecision = "exact" | "interpolated" | "place" | "street" | "area";

export const PRECISION_LABEL: Record<MatchPrecision, string> = {
  exact: "Exact address",
  interpolated: "Estimated on the street",
  place: "Named place",
  street: "Street only, number not found",
  area: "Area only",
};

/** Whether a result may be kept (a property's coordinates) or is only shown; the service bills and licenses the two differently. */
export type IntendedUse = "SingleUse" | "Storage";

export interface AddressResult {
  /** Full label as returned by the service, e.g. "1420 Foundry St, Cedar Ridge, CA 92562, USA". */
  label: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude: number;
  longitude: number;
  precision: MatchPrecision;
}

/** How far in to fly for each kind of match: an exact address earns a
 *  closer look than a town. */
export const ZOOM_FOR_PRECISION: Record<MatchPrecision, number> = {
  exact: 18,
  interpolated: 18,
  place: 17,
  street: 16,
  area: 13,
};

/** Where to centre an agency with nothing on its map yet: its own address,
 *  shown wide enough to take in the district around it. */
export function agencyHomeView(results: AddressResult[]): { latitude: number; longitude: number; zoom: number } | null {
  const top = results[0];
  if (!top) return null;
  return { latitude: top.latitude, longitude: top.longitude, zoom: top.precision === "area" ? 11 : 13 };
}

/** Agencies on the platform are in the US; without this a street address
 *  matches the same street name in every country. */
export const SEARCH_COUNTRIES = ["USA"];

/** The fields of a Places API result (SearchText, Geocode) the mapping reads. */
export interface PlaceLike {
  /** PointAddress, InterpolatedAddress, PointOfInterest, Street, Locality, PostalCode, ... */
  PlaceType?: string;
  Title?: string;
  /** True when the service changed the house number asked for to one it knows. */
  AddressNumberCorrected?: boolean;
  Address?: {
    Label?: string;
    AddressNumber?: string;
    Street?: string;
    Locality?: string;
    PostalCode?: string;
    Region?: { Code?: string; Name?: string };
  };
  /** [longitude, latitude] */
  Position?: number[];
}

export function precisionOf(p: PlaceLike): MatchPrecision {
  switch (p.PlaceType) {
    case "PointAddress":
    case "SecondaryAddress":
    case "InferredSecondaryAddress":
      // A corrected house number is a nearby known address, not the one asked for.
      return p.AddressNumberCorrected ? "interpolated" : "exact";
    case "InterpolatedAddress":
      return "interpolated";
    case "PointOfInterest":
      return "place";
    case "Street":
    case "Intersection":
      return "street";
    default:
      return "area";
  }
}

/** A result as the screens and the locator use it, or null when it has no usable point. */
export function toAddressResult(p: PlaceLike): AddressResult | null {
  const pos = p.Position;
  if (!pos || pos.length !== 2) return null;
  const a = p.Address ?? {};
  return {
    label: a.Label ?? p.Title ?? "",
    address: [a.AddressNumber, a.Street].filter(Boolean).join(" ") || undefined,
    city: a.Locality ?? undefined,
    state: a.Region?.Code ?? a.Region?.Name ?? undefined,
    zip: a.PostalCode ?? undefined,
    longitude: pos[0],
    latitude: pos[1],
    precision: precisionOf(p),
  };
}

/** True when the query starts with a house number and a street
 *  ("1420 Foundry"), i.e. the user is after one building, not a street or
 *  a town. A bare number is a ZIP code, not an address. */
export function looksLikeStreetAddress(query: string): boolean {
  return /^\s*\d+[a-z]?\s+\S/i.test(query);
}

const RANK: Record<MatchPrecision, number> = { exact: 0, interpolated: 1, place: 2, street: 3, area: 4 };

/** For a house-number query, real address matches first; otherwise the
 *  provider's relevance order stands. Stable, so ties keep that order. */
export function rankResults(results: AddressResult[], query: string): AddressResult[] {
  if (!looksLikeStreetAddress(query)) return results;
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => RANK[a.r.precision] - RANK[b.r.precision] || a.i - b.i)
    .map(({ r }) => r);
}
