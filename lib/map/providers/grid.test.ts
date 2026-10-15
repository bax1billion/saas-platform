import { describe, expect, it } from "vitest";
import { availableBasemaps, createProviders, providerFor } from "./index";
import { GRID_SOURCE, gridProvider, gridStyle, type GridColors, type GridData } from "./grid";

const colors: GridColors = {
  ground: "ground",
  street: "street",
  casing: "casing",
  majorCasing: "majorCasing",
  arterial: "arterial",
  arterialCasing: "arterialCasing",
  water: "water",
  park: "park",
};

const town: GridData = {
  features: [{ type: "Feature", properties: { name: "First Avenue", kind: "avenue", major: true }, geometry: { type: "LineString", coordinates: [[0, 0], [0, 1]] } }],
  labels: [{ name: "First Avenue", at: { lng: 0, lat: 0.5 }, rotate: -90 }],
  bounds: { west: -1, south: -1, east: 1, north: 1 },
};

describe("gridStyle", () => {
  it("draws the town from one source with the ground, the park, the water and the roads", () => {
    const style = gridStyle(town, colors);
    expect(Object.keys(style.sources)).toEqual([GRID_SOURCE]);
    expect((style.sources[GRID_SOURCE] as { data: GeoJSON.FeatureCollection }).data.features).toHaveLength(1);
    expect(style.layers.map((l) => l.id)).toEqual(["ground", "park", "water", "minor-casing", "major-casing", "arterial-casing", "minor", "major", "arterial"]);
    expect(style.layers.every((l) => l.type === "background" || ("source" in l && l.source === GRID_SOURCE))).toBe(true);
    expect(JSON.stringify(style)).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});

describe("gridProvider", () => {
  it("is a pack that draws only the grid, with its labels and its edge", async () => {
    const p = gridProvider(town, () => colors);
    expect(p.offline).toBe("pack");
    expect(p.basemaps).toEqual(["grid"]);
    const resolved = await p.resolve("grid", { access: "signedIn", colorScheme: "Light", terrain: false });
    expect(resolved.source).toBe("pack");
    expect(resolved.attribution).toBe("");
    expect(resolved.maxBounds).toEqual(town.bounds);
    expect(resolved.labels).toEqual(town.labels);
    await expect(p.resolve("streets", { access: "signedIn", colorScheme: "Light", terrain: false })).rejects.toThrow();
  });
});

describe("createProviders", () => {
  it("lists what the environment can draw: hosted styles only where services are deployed, the grid only where a town is given", () => {
    expect(availableBasemaps(createProviders({ config: null }))).toEqual([]);
    expect(availableBasemaps(createProviders({ config: null, grid: town }))).toEqual(["grid"]);
    const all = createProviders({ config: { region: "us-west-2" }, grid: town, gridColors: () => colors });
    expect(availableBasemaps(all)).toEqual(["streets", "satellite", "grid"]);
    expect(providerFor(all, "satellite")?.id).toBe("amazon");
    expect(providerFor(all, "grid")?.id).toBe("grid");
    expect(providerFor(createProviders({ config: null }), "streets")).toBeNull();
  });
});
