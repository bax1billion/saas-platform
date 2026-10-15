import { describe, expect, it } from "vitest";
import { basemapStyleUrl, STYLE_FOR_BASEMAP, styleUrl } from "./basemap";

describe("styleUrl", () => {
  it("points at the published style's descriptor, light unless told otherwise", () => {
    expect(styleUrl("us-west-2", "Standard")).toBe(
      "https://maps.geo.us-west-2.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Light"
    );
    expect(styleUrl("us-west-2", "Standard", { colorScheme: "Dark" })).toBe(
      "https://maps.geo.us-west-2.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Dark"
    );
  });

  it("adds hillshade to the vector styles only", () => {
    expect(styleUrl("us-east-2", "Standard", { terrain: true })).toContain("?color-scheme=Light&terrain=Hillshade");
    expect(styleUrl("us-east-2", "Monochrome", { terrain: true, colorScheme: "Dark" })).toContain(
      "/v2/styles/Monochrome/descriptor?color-scheme=Dark&terrain=Hillshade"
    );
    expect(styleUrl("us-east-2", "Hybrid", { terrain: true, colorScheme: "Dark" })).toBe(
      "https://maps.geo.us-east-2.amazonaws.com/v2/styles/Hybrid/descriptor"
    );
    expect(styleUrl("us-east-2", "Satellite")).toBe("https://maps.geo.us-east-2.amazonaws.com/v2/styles/Satellite/descriptor");
  });
});

describe("basemapStyleUrl", () => {
  it("draws streets on Standard and satellite on Hybrid, which carries the labels", () => {
    expect(STYLE_FOR_BASEMAP).toEqual({ streets: "Standard", satellite: "Hybrid" });
    expect(basemapStyleUrl("us-west-2", "streets")).toContain("/v2/styles/Standard/descriptor?color-scheme=Light");
    expect(basemapStyleUrl("us-west-2", "satellite")).toBe("https://maps.geo.us-west-2.amazonaws.com/v2/styles/Hybrid/descriptor");
  });
});
