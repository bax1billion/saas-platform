import { describe, expect, it } from "vitest";
import { boundsArray, initialMapState, mapReducer, type MapState } from "./state";

const start = (): MapState => initialMapState({ center: { lng: -117.1, lat: 33.9 }, zoom: 14, layers: { a: true, b: false } });

describe("initialMapState", () => {
  it("opens in view mode on the streets with the given camera and layers", () => {
    const s = start();
    expect(s.camera).toEqual({ center: { lng: -117.1, lat: 33.9 }, zoom: 14, bearing: 0, pitch: 0 });
    expect(s.basemap).toBe("streets");
    expect(s.source).toBe("online");
    expect(s.mode).toBe("view");
    expect(s.selection).toBeNull();
    expect(s.layers).toEqual({ a: true, b: false });
    expect(s.fit).toBeNull();
    expect(s.fly).toBeNull();
  });
});

describe("mapReducer", () => {
  it("records the camera", () => {
    const camera = { center: { lng: 1, lat: 2 }, zoom: 9, bearing: 30, pitch: 10 };
    expect(mapReducer(start(), { type: "camera", camera }).camera).toEqual(camera);
  });

  it("changes the basemap and leaves the camera where it is", () => {
    const s = mapReducer(start(), { type: "camera", camera: { center: { lng: 5, lat: 6 }, zoom: 17, bearing: 0, pitch: 0 } });
    const next = mapReducer(s, { type: "basemap", basemap: "satellite" });
    expect(next.basemap).toBe("satellite");
    expect(next.camera).toEqual(s.camera);
    expect(mapReducer(next, { type: "basemap", basemap: "satellite" })).toBe(next);
  });

  it("records where the tiles come from", () => {
    expect(mapReducer(start(), { type: "source", source: "pack" }).source).toBe("pack");
  });

  it("switches one layer or replaces the set, without knowing what a key means", () => {
    const one = mapReducer(start(), { type: "layer", key: "b", on: true });
    expect(one.layers).toEqual({ a: true, b: true });
    expect(mapReducer(one, { type: "layer", key: "b", on: true })).toBe(one);
    expect(mapReducer(one, { type: "layers", layers: { c: true } }).layers).toEqual({ c: true });
  });

  it("selects one feature in view mode and ignores a selection while a tool is in hand", () => {
    const picked = mapReducer(start(), { type: "select", key: "mark:1" });
    expect(picked.selection).toBe("mark:1");
    expect(mapReducer(picked, { type: "select", key: null }).selection).toBeNull();
    for (const mode of ["draw", "measure", "place"] as const) {
      const tool = mapReducer(start(), { type: "mode", mode });
      expect(mapReducer(tool, { type: "select", key: "mark:2" })).toBe(tool);
    }
  });

  it("drops the shape in hand when a tool is put down", () => {
    const drawing = mapReducer(mapReducer(start(), { type: "mode", mode: "draw" }), { type: "draw", draw: { mode: "polygon", featureId: "d1", geometry: null } });
    expect(drawing.draw?.featureId).toBe("d1");
    expect(mapReducer(drawing, { type: "mode", mode: "measure" }).draw).toEqual(drawing.draw);
    expect(mapReducer(drawing, { type: "mode", mode: "view" }).draw).toBeNull();
  });

  it("makes fit and fly one-shot requests the map clears after performing them", () => {
    const bounds = { west: -1, south: -1, east: 1, north: 1 };
    const fit = mapReducer(start(), { type: "fit", bounds });
    expect(fit.fit).toEqual({ bounds, key: 1 });
    const again = mapReducer(fit, { type: "fit", bounds });
    expect(again.fit?.key).toBe(2);
    expect(mapReducer(again, { type: "handled", what: "fit" }).fit).toBeNull();
    const fly = mapReducer(again, { type: "fly", center: { lng: 0, lat: 0 }, zoom: 16 });
    expect(fly.fly).toEqual({ center: { lng: 0, lat: 0 }, zoom: 16, key: 3 });
    expect(fly.fit).toBeNull();
    expect(mapReducer(fly, { type: "handled", what: "fly" }).fly).toBeNull();
    expect(mapReducer(fly, { type: "handled", what: "fit" })).toBe(fly);
  });

  it("writes bounds the way MapLibre takes them", () => {
    expect(boundsArray({ west: -1, south: -2, east: 3, north: 4 })).toEqual([-1, -2, 3, 4]);
  });
});
