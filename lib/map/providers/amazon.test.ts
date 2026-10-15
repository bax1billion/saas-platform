import { describe, expect, it, vi } from "vitest";

vi.mock("../location", async () => {
  const actual = await vi.importActual<typeof import("../location")>("../location");
  return { ...actual, locationAuth: vi.fn() };
});

import { AMAZON_ATTRIBUTION, amazonProvider } from "./amazon";

const cfg = { region: "us-west-2", publicMapKey: "k123" };
const signedIn = { access: "signedIn" as const, colorScheme: "Light" as const, terrain: false };

describe("amazonProvider", () => {
  it("offers streets and satellite and is never a pack", () => {
    const p = amazonProvider(cfg);
    expect(p.id).toBe("amazon");
    expect(p.basemaps).toEqual(["streets", "satellite"]);
    expect(p.offline).toBe("never");
  });

  it("resolves a signed-in member's streets to the published Standard style in the asked scheme", async () => {
    const p = amazonProvider(cfg);
    const light = await p.resolve("streets", signedIn);
    expect(light.style).toBe("https://maps.geo.us-west-2.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Light");
    expect(light.source).toBe("online");
    expect(light.attribution).toBe(AMAZON_ATTRIBUTION);
    const dark = await p.resolve("streets", { ...signedIn, colorScheme: "Dark", terrain: true });
    expect(dark.style).toBe("https://maps.geo.us-west-2.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Dark&terrain=Hillshade");
  });

  it("resolves satellite to the published Hybrid style", async () => {
    expect((await amazonProvider(cfg).resolve("satellite", signedIn)).style).toBe("https://maps.geo.us-west-2.amazonaws.com/v2/styles/Hybrid/descriptor");
  });

  it("gives a page with no account the street map through the public key, and nothing else", async () => {
    const p = amazonProvider(cfg);
    const pub = await p.resolve("streets", { ...signedIn, access: "public" });
    expect(pub.style).toContain("/v2/styles/Standard/descriptor?color-scheme=Light&key=k123");
    await expect(p.resolve("satellite", { ...signedIn, access: "public" })).rejects.toThrow(/street map/);
    await expect(amazonProvider({ region: "us-west-2" }).resolve("streets", { ...signedIn, access: "public" })).rejects.toThrow(/public street map key/);
  });

  it("refuses the grid", async () => {
    await expect(amazonProvider(cfg).resolve("grid", signedIn)).rejects.toThrow();
  });
});
