import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@aws-sdk/client-geo-places", () => ({
  GeoPlacesClient: class {
    send = send;
  },
  SearchTextCommand: class {
    kind = "text";
    constructor(public input: Record<string, unknown>) {}
  },
  SuggestCommand: class {
    kind = "suggest";
    constructor(public input: Record<string, unknown>) {}
  },
}));
const cfg = { region: "us-east-2" };
let deployed = true;
vi.mock("./location", () => ({
  mapConfig: () => (deployed ? cfg : null),
  requireMapConfig: () => cfg,
  getLocationAuthHelper: async () => ({ getClientConfig: () => ({}) }),
}));

import {
  agencyHomeView,
  canSuggest,
  looksLikeStreetAddress,
  precisionOf,
  rankResults,
  searchAddress,
  suggestAddresses,
  toAddressResult,
  type AddressResult,
} from "./geocode";

const item = (over: Record<string, unknown> = {}) => ({
  PlaceId: "p1",
  PlaceType: "PointAddress",
  Title: "1420 Foundry St",
  Address: {
    Label: "1420 Foundry St, Cedar Ridge, CA 92562, USA",
    AddressNumber: "1420",
    Street: "Foundry St",
    Locality: "Cedar Ridge",
    Region: { Code: "CA", Name: "California" },
    PostalCode: "92562",
  },
  Position: [-117.1, 33.9],
  ...over,
});

beforeEach(() => {
  send.mockReset();
  deployed = true;
});

describe("searchAddress", () => {
  it("returns [] for blank input without calling the service", async () => {
    expect(await searchAddress("   ")).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("maps a result to an AddressResult (Position is [lng, lat], the state is its code)", async () => {
    send.mockResolvedValue({ ResultItems: [item()] });
    expect(await searchAddress("1420 foundry")).toEqual([
      {
        label: "1420 Foundry St, Cedar Ridge, CA 92562, USA",
        address: "1420 Foundry St",
        city: "Cedar Ridge",
        state: "CA",
        zip: "92562",
        longitude: -117.1,
        latitude: 33.9,
        precision: "exact",
      },
    ]);
  });

  it("trims the query, stays in the US and asks for a storable result unless told the result is only shown", async () => {
    send.mockResolvedValue({ ResultItems: [] });
    await searchAddress("  1420 foundry  ");
    const cmd = send.mock.calls[0][0] as { kind: string; input: Record<string, unknown> };
    expect(cmd.kind).toBe("text");
    expect(cmd.input).toMatchObject({ QueryText: "1420 foundry", MaxResults: 8, Filter: { IncludeCountries: ["USA"] }, IntendedUse: "Storage" });
    await searchAddress("x", { intendedUse: "SingleUse" });
    expect((send.mock.calls[1][0] as { input: Record<string, unknown> }).input.IntendedUse).toBe("SingleUse");
  });

  it("puts address matches ahead of the street for a house-number query", async () => {
    send.mockResolvedValue({
      ResultItems: [
        item({ PlaceType: "Street", Address: { Label: "Foundry St, Cedar Ridge, CA", Street: "Foundry St" } }),
        item({ PlaceType: "InterpolatedAddress", Address: { Label: "1420 Foundry St (estimated)", AddressNumber: "1420", Street: "Foundry St" } }),
      ],
    });
    expect((await searchAddress("1420 Foundry St")).map((r) => r.precision)).toEqual(["interpolated", "street"]);
  });

  it("biases results only when both coordinates are given", async () => {
    send.mockResolvedValue({ ResultItems: [] });
    await searchAddress("x", { biasLongitude: -117, biasLatitude: 34 });
    await searchAddress("x", { biasLongitude: -117 });
    const [withBias, partial] = send.mock.calls.map((c) => (c[0] as { input: { BiasPosition?: number[] } }).input);
    expect(withBias.BiasPosition).toEqual([-117, 34]);
    expect(partial.BiasPosition).toBeUndefined();
  });

  it("accepts a bias of 0,0 (falsy but valid)", async () => {
    send.mockResolvedValue({ ResultItems: [] });
    await searchAddress("x", { biasLongitude: 0, biasLatitude: 0 });
    expect((send.mock.calls[0][0] as { input: { BiasPosition?: number[] } }).input.BiasPosition).toEqual([0, 0]);
  });

  it("drops results without a usable point", async () => {
    send.mockResolvedValue({
      ResultItems: [item({ Position: undefined }), item({ Position: [1] }), item()],
    });
    expect(await searchAddress("x")).toHaveLength(1);
  });

  it("leaves address undefined when the result has no street parts, and falls back to the title and the region name", async () => {
    send.mockResolvedValue({ ResultItems: [item({ PlaceType: "Locality", Address: { Locality: "Cedar Ridge", Region: { Name: "California" } } })] });
    const [r] = await searchAddress("x");
    expect(r.address).toBeUndefined();
    expect(r.label).toBe("1420 Foundry St");
    expect(r.state).toBe("California");
    expect(r.precision).toBe("area");
  });

  it("tolerates a response with no ResultItems", async () => {
    send.mockResolvedValue({});
    expect(await searchAddress("x")).toEqual([]);
  });
});

describe("precisionOf", () => {
  it("tells a known address from an estimated one, a place, a street and an area", () => {
    expect(precisionOf({ PlaceType: "PointAddress" })).toBe("exact");
    expect(precisionOf({ PlaceType: "SecondaryAddress" })).toBe("exact");
    expect(precisionOf({ PlaceType: "InterpolatedAddress" })).toBe("interpolated");
    expect(precisionOf({ PlaceType: "PointOfInterest" })).toBe("place");
    expect(precisionOf({ PlaceType: "Street" })).toBe("street");
    expect(precisionOf({ PlaceType: "Intersection" })).toBe("street");
    expect(precisionOf({ PlaceType: "Locality" })).toBe("area");
    expect(precisionOf({ PlaceType: "PostalCode" })).toBe("area");
    expect(precisionOf({})).toBe("area");
  });

  it("treats a corrected house number as an estimate, not the address asked for", () => {
    expect(precisionOf({ PlaceType: "PointAddress", AddressNumberCorrected: true })).toBe("interpolated");
  });
});

describe("toAddressResult", () => {
  it("is null without a two-number position", () => {
    expect(toAddressResult({ PlaceType: "PointAddress" })).toBeNull();
    expect(toAddressResult({ PlaceType: "PointAddress", Position: [1, 2, 3] })).toBeNull();
  });
});

describe("rankResults", () => {
  const r = (precision: AddressResult["precision"], label: string): AddressResult => ({ label, precision, latitude: 0, longitude: 0 });

  it("orders by precision for a house-number query, keeping provider order on ties", () => {
    const ranked = rankResults([r("area", "a"), r("street", "s"), r("exact", "e1"), r("interpolated", "i"), r("exact", "e2")], "1420 Foundry");
    expect(ranked.map((x) => x.label)).toEqual(["e1", "e2", "i", "s", "a"]);
  });

  it("leaves provider order alone for a street or town query", () => {
    const input = [r("area", "a"), r("exact", "e")];
    expect(rankResults(input, "Foundry St").map((x) => x.label)).toEqual(["a", "e"]);
  });
});

describe("looksLikeStreetAddress", () => {
  it("spots a leading house number", () => {
    expect(looksLikeStreetAddress("1420 Foundry St")).toBe(true);
    expect(looksLikeStreetAddress("  12B Mill Rd")).toBe(true);
    expect(looksLikeStreetAddress("Foundry St")).toBe(false);
    expect(looksLikeStreetAddress("92562")).toBe(false);
    expect(looksLikeStreetAddress("92562 ")).toBe(false);
  });
});

describe("suggestAddresses", () => {
  it("asks for suggestions in the US, with the bias, and returns titles only", async () => {
    send.mockResolvedValue({ ResultItems: [{ Title: "2620 N 3rd St, Cedar Ridge, CA 92562, USA", SuggestResultItemType: "Place" }] });
    expect(await suggestAddresses(" 2620 n 3rd ", { biasLongitude: -117, biasLatitude: 34 })).toEqual([
      "2620 N 3rd St, Cedar Ridge, CA 92562, USA",
    ]);
    const cmd = send.mock.calls[0][0] as { kind: string; input: Record<string, unknown> };
    expect(cmd.kind).toBe("suggest");
    expect(cmd.input).toEqual({ QueryText: "2620 n 3rd", MaxResults: 8, Filter: { IncludeCountries: ["USA"] }, BiasPosition: [-117, 34] });
  });

  it("drops blanks and duplicates", async () => {
    send.mockResolvedValue({ ResultItems: [{ Title: "A St" }, { Title: " " }, {}, { Title: "A St" }, { Title: "B St" }] });
    expect(await suggestAddresses("abc")).toEqual(["A St", "B St"]);
  });

  it("does nothing, and says so, where map services aren't deployed", async () => {
    deployed = false;
    expect(canSuggest()).toBe(false);
    expect(await suggestAddresses("2620 n 3rd")).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("agencyHomeView", () => {
  const r = (precision: AddressResult["precision"]): AddressResult => ({ label: "x", precision, latitude: 33.4, longitude: -112.1 });

  it("centres on the top match, wide enough to see the district", () => {
    expect(agencyHomeView([r("exact"), r("area")])).toEqual({ latitude: 33.4, longitude: -112.1, zoom: 13 });
  });

  it("pulls back further when only the town was found", () => {
    expect(agencyHomeView([r("area")])?.zoom).toBe(11);
  });

  it("is null when the address found nothing", () => {
    expect(agencyHomeView([])).toBeNull();
  });
});
