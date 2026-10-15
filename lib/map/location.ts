"use client";

import { fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { withCredentialProvider, type MapAuthHelper, type SDKAuthHelper } from "@aws/amazon-location-utilities-auth-helper";
import outputs from "@/amplify_outputs.json";
import { basemapStyleUrl, type Basemap, type StyleOptions } from "./basemap";

/** `outputs.custom.map`, published by amplify/backend.ts (amplify/custom/location/resource.ts). */
export interface MapConfig {
  region: string;
  /** A key that fetches the street map only, only from /share/ pages (amplify/backend.ts). */
  publicMapKey?: string;
}

/** The deployment's map services, or null where none are deployed (a `{}` outputs stub, CI). */
export function mapConfig(): MapConfig | null {
  const map = (outputs as { custom?: { map?: Partial<MapConfig> } }).custom?.map;
  return map?.region ? (map as MapConfig) : null;
}

/** The map services, for a screen that cannot work without them: says plainly when they are not deployed. */
export function requireMapConfig(): MapConfig {
  const map = mapConfig();
  if (!map) {
    throw new Error("Map services aren't deployed for this environment yet. Run `ampx sandbox` (or deploy) after pulling amplify/custom/location.");
  }
  return map;
}

let helperPromise: Promise<MapAuthHelper & SDKAuthHelper> | null = null;

// The helper holds the credentials of whoever built it: drop it when the
// user changes, so a new user never borrows the last one's group role.
if (typeof window !== "undefined") {
  Hub.listen("auth", ({ payload }) => {
    if (payload.event === "signedIn" || payload.event === "signedOut" || payload.event === "tokenRefresh_failure") helperPromise = null;
  });
}

/**
 * Signs map and search requests with the signed-in user's own Identity Pool
 * credentials (their group's role holds the geo grants). A guest session
 * also gets credentials, but the guest role has no map access, so only a
 * session with tokens is used. For the current Maps API the helper signs
 * the tile requests and leaves the style descriptor, glyphs and sprites
 * unsigned, which is what the service expects.
 */
export function locationAuth(region: string): Promise<MapAuthHelper & SDKAuthHelper> {
  if (!helperPromise) {
    helperPromise = withCredentialProvider(async () => {
      let session;
      try {
        session = await fetchAuthSession();
      } catch (err) {
        // Cognito refuses a sign-in token it can't verify (revoked, or issued
        // by another environment's user pool on the same localhost) with a
        // message no one can act on.
        if (err instanceof Error && err.name === "NotAuthorizedException") {
          throw new Error("Your sign-in has expired or belongs to another environment. Sign out, sign back in, and reload the page.");
        }
        throw err;
      }
      if (!session.tokens || !session.credentials) throw new Error("Sign in to use the map.");
      return session.credentials;
    }, region).catch((err) => {
      // Never cache a failure: the next call after signing in tries again.
      helperPromise = null;
      throw err;
    });
  }
  return helperPromise;
}

/** The signer for this deployment's map services (MapLibre tiles and the Places client). */
export function getLocationAuthHelper(): Promise<MapAuthHelper & SDKAuthHelper> {
  return locationAuth(requireMapConfig().region);
}

/**
 * The style to give MapLibre for `basemap`, with the options that sign its
 * tile requests. Throws when the person is not signed in.
 */
export async function basemapStyle(map: MapConfig, basemap: Basemap, opts?: StyleOptions) {
  const auth = await locationAuth(map.region);
  return { style: basemapStyleUrl(map.region, basemap, opts), options: auth.getMapAuthenticationOptions() };
}

/**
 * The street map for a page opened with no account: the public key (not a
 * sign-in) is added to every request to the map service. Null where the
 * environment has no public key; the page then draws without a basemap.
 */
export function publicBasemapStyle(map: MapConfig): { style: string; options: { transformRequest: (url: string) => { url: string } } } | null {
  if (!map.publicMapKey) return null;
  const key = encodeURIComponent(map.publicMapKey);
  const withKey = (url: string) => (url.includes(".amazonaws.com/") && !/[?&]key=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}key=${key}` : url);
  return { style: withKey(basemapStyleUrl(map.region, "streets")), options: { transformRequest: (url: string) => ({ url: withKey(url) }) } };
}
