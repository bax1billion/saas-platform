"use client";

import { GeoPlacesClient, SearchTextCommand, SuggestCommand } from "@aws-sdk/client-geo-places";
import { getLocationAuthHelper, mapConfig } from "./location";

import {
  rankResults,
  SEARCH_COUNTRIES,
  toAddressResult,
  type AddressResult,
  type IntendedUse,
} from "./geocode-result";

/** The pure half (match precision, ranking, the US filter, the result
 *  mapping) lives in ./geocode-result.ts so the locator Lambda shares it;
 *  the browser-side names are re-exported here for the screens. */
export {
  agencyHomeView,
  looksLikeStreetAddress,
  PRECISION_LABEL,
  precisionOf,
  rankResults,
  SEARCH_COUNTRIES,
  toAddressResult,
  ZOOM_FOR_PRECISION,
  type AddressResult,
  type IntendedUse,
  type MatchPrecision,
} from "./geocode-result";

const MAX_RESULTS = 8;

type Bias = { biasLongitude?: number; biasLatitude?: number };

const biasPosition = (opts?: Bias) =>
  opts?.biasLongitude !== undefined && opts?.biasLatitude !== undefined
    ? [opts.biasLongitude, opts.biasLatitude]
    : undefined;

async function placesClient(): Promise<GeoPlacesClient> {
  const authHelper = await getLocationAuthHelper();
  return new GeoPlacesClient(authHelper.getClientConfig());
}

/** Whether this environment has map services deployed (type-ahead needs nothing else). */
export function canSuggest(): boolean {
  return mapConfig() !== null;
}

/**
 * Type-ahead from partial input ("2620 N 3rd"). Returns display text only:
 * a suggestion is never stored, and the call stays in the Places API's
 * cheapest bucket (no extra features asked for). Picking one runs
 * `searchAddress` on its text, and that result is what gets saved.
 */
export async function suggestAddresses(text: string, opts?: Bias): Promise<string[]> {
  const query = text.trim();
  if (!query || !canSuggest()) return [];

  const client = await placesClient();
  const { ResultItems } = await client.send(
    new SuggestCommand({
      QueryText: query,
      MaxResults: MAX_RESULTS,
      Filter: { IncludeCountries: [...SEARCH_COUNTRIES] },
      BiasPosition: biasPosition(opts),
    })
  );
  const seen = new Set<string>();
  return (ResultItems ?? [])
    .map((r) => r.Title?.trim() ?? "")
    .filter((t) => t && !seen.has(t) && seen.add(t));
}

/**
 * Address lookup on the Places API. A geocoder, not an autocomplete: it
 * matches best on a whole address. The result may be kept (a property's
 * coordinates), so the intended use is `Storage` unless the caller says
 * the result is only shown; the service bills the two differently and its
 * terms allow keeping only what was asked for as storable.
 */
export async function searchAddress(text: string, opts?: Bias & { intendedUse?: IntendedUse }): Promise<AddressResult[]> {
  const query = text.trim();
  if (!query) return [];

  const client = await placesClient();
  const { ResultItems } = await client.send(
    new SearchTextCommand({
      QueryText: query,
      MaxResults: MAX_RESULTS,
      Filter: { IncludeCountries: [...SEARCH_COUNTRIES] },
      BiasPosition: biasPosition(opts),
      IntendedUse: opts?.intendedUse ?? "Storage",
    })
  );

  const results = (ResultItems ?? [])
    .map(toAddressResult)
    .filter((r): r is AddressResult => r !== null);
  return rankResults(results, query);
}
