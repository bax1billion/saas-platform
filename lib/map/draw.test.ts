import { describe, expect, it } from "vitest";
import { DRAW_GEOMETRY, DRAW_MODES, toDrawFeature } from "./draw";
import { measureTag } from "./measure";
import { initialMapState, mapReducer } from "./state";

describe("the drawing tools", () => {
  it("are point, line, polygon, circle, freehand, select and measure, each drawing one kind of shape", () => {
    expect(DRAW_MODES).toEqual(["point", "linestring", "polygon", "circle", "freehand", "select", "measure"]);
    expect(DRAW_GEOMETRY).toEqual({ point: "Point", linestring: "LineString", polygon: "Polygon", circle: "Polygon", freehand: "Polygon", measure: "LineString", select: null });
  });

  it("hand a finished shape to the product with its geometry untouched and the tool named", () => {
    const ring = [
      [-117.1, 33.9],
      [-117.1, 33.91],
      [-117.09, 33.91],
      [-117.1, 33.9],
    ];
    const f = toDrawFeature({ id: "d1", type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { mode: "polygon", own: 1 } });
    expect(f).toEqual({ id: "d1", geometry: { type: "Polygon", coordinates: [ring] }, properties: { mode: "polygon", own: 1 } });
  });

  it("tag a measured line with its straight-line length at the midpoint", () => {
    const line = { type: "LineString" as const, coordinates: [[-117.1, 33.9], [-117.1, 33.91]] };
    const tag = measureTag(line)!;
    expect(tag.feet).toBeGreaterThan(3600);
    expect(tag.feet).toBeLessThan(3700);
    expect(tag.text).toMatch(/^3,6\d\d ft straight line$/);
    expect(tag.at).toEqual([-117.1, 33.905]);
    expect(measureTag({ type: "LineString", coordinates: [[0, 0]] })).toBeNull();
    expect(measureTag(null)).toBeNull();
    const f = toDrawFeature({ id: "m1", type: "Feature", geometry: line, properties: { mode: "measure" } });
    expect(f.properties.tag).toBe(tag.text);
    expect(f.properties.feet).toBe(tag.feet);
  });

  it("cancelling drops the shape in hand from the map state", () => {
    const drawing = mapReducer(mapReducer(initialMapState({ center: { lng: 0, lat: 0 } }), { type: "mode", mode: "draw" }), { type: "draw", draw: { mode: "polygon", featureId: "d1", geometry: null } });
    expect(drawing.draw?.mode).toBe("polygon");
    const cancelled = mapReducer(drawing, { type: "mode", mode: "view" });
    expect(cancelled.draw).toBeNull();
    expect(cancelled.mode).toBe("view");
  });
});
