import type { MapOptions } from "maplibre-gl";
import { basemapStyleUrl } from "../basemap";
import { locationAuth, publicBasemapStyle, type MapConfig } from "../location";
import type { BasemapProvider, MapAccess } from "./types";

/** For an export's footer; the style descriptor credits its sources on the map itself. */
export const AMAZON_ATTRIBUTION = "Map data from Amazon Location Service and HERE";

/**
 * Amazon Location's published styles: streets (`Standard`, light or dark)
 * and satellite (`Hybrid`). Tiles may not be stored on a device (the AWS
 * service terms), so this provider is never a pack. A page opened with no
 * account gets the street map only, through the public key.
 */
export function amazonProvider(config: MapConfig): BasemapProvider {
  return {
    id: "amazon",
    basemaps: ["streets", "satellite"],
    offline: "never",
    async resolve(basemap, req) {
      if (basemap === "grid") throw new Error("The invented grid is not a hosted map.");
      if (req.access === "public") {
        if (basemap !== "streets") throw new Error("Only the street map is open to a page with no account.");
        const resolved = publicBasemapStyle(config);
        if (!resolved) throw new Error("No public street map key in this environment.");
        return { style: resolved.style, source: "online", attribution: AMAZON_ATTRIBUTION };
      }
      return {
        style: basemapStyleUrl(config.region, basemap, { colorScheme: req.colorScheme, terrain: req.terrain }),
        source: "online",
        attribution: AMAZON_ATTRIBUTION,
      };
    },
  };
}

/**
 * The request signing for a map built on this provider, set once when the
 * map is constructed: the member's own credentials sign the tiles, or the
 * public key is added to every map request. The signer touches only the
 * map service's URLs, so a style from another provider passes through.
 */
export async function amazonSigning(config: MapConfig, access: MapAccess): Promise<Partial<MapOptions>> {
  if (access === "public") return publicBasemapStyle(config)?.options ?? {};
  const auth = await locationAuth(config.region);
  return auth.getMapAuthenticationOptions();
}
