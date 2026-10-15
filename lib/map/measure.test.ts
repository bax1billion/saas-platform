import { describe, expect, it } from "vitest";
import { distanceFeet, distanceMetres, formatFeet, measureGeoJson, midpoint } from "./measure";

describe("distance", () => {
  it("is zero for the same point", () => {
    const p = { latitude: 38.7402, longitude: -121.2812 };
    expect(distanceFeet(p, p)).toBe(0);
  });

  it("one degree of latitude is about 111.2 km", () => {
    expect(distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -1);
  });

  it("matches a known street-scale distance in feet", () => {
    // 0.001 degrees of latitude is about 364.8 ft anywhere.
    const ft = distanceFeet({ latitude: 38.74, longitude: -121.28 }, { latitude: 38.741, longitude: -121.28 });
    expect(ft).toBeGreaterThan(364);
    expect(ft).toBeLessThan(366);
  });

  it("shrinks east-west distances with latitude", () => {
    const atEquator = distanceFeet({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 });
    const at60 = distanceFeet({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 0.001 });
    expect(at60 / atEquator).toBeCloseTo(0.5, 2);
  });

  it("is the same both ways", () => {
    const a = { latitude: 38.7402, longitude: -121.2812 };
    const b = { latitude: 38.7515, longitude: -121.2698 };
    expect(distanceFeet(a, b)).toBeCloseTo(distanceFeet(b, a), 6);
  });
});

describe("formatFeet", () => {
  it("whole feet with separators, miles past one mile", () => {
    expect(formatFeet(247.6)).toBe("248 ft");
    expect(formatFeet(5279.4)).toBe("5,279 ft");
    expect(formatFeet(12_400)).toBe("12,400 ft (2.35 mi)");
  });
});

describe("geometry", () => {
  const a = { latitude: 1, longitude: 2 };
  const b = { latitude: 3, longitude: 4 };

  it("puts the readout halfway", () => {
    expect(midpoint(a, b)).toEqual({ latitude: 2, longitude: 3 });
  });

  it("draws ends as they are picked and the line once both exist", () => {
    expect(measureGeoJson(null, null).features).toHaveLength(0);
    expect(measureGeoJson(a, null).features.map((f) => f.geometry.type)).toEqual(["Point"]);
    const full = measureGeoJson(a, b);
    expect(full.features.map((f) => f.geometry.type)).toEqual(["Point", "Point", "LineString"]);
    expect(full.features[2].geometry.coordinates).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });
});
