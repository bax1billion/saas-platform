import { describe, expect, it, vi } from "vitest";
import { FIELD_TARGET_PX, FIELD_TEXT_PX, ICON_MIN_PX } from "../floors";
import type { LayerFeatures, MapLayer } from "./contract";
import {
  CLUSTER_THRESHOLD,
  createReadScheduler,
  featureSourceIds,
  firstSymbolLayerId,
  flooredTextSize,
  HIT_PAD_PX,
  hitsOf,
  iconSizeExpression,
  labelTextSize,
  layerIds,
  layerOrder,
  layerSpecs,
  minimumOf,
  pointLayerIds,
  shouldCluster,
  sourceId,
} from "./render";

const layer = (key: string, style: MapLayer["style"], read?: MapLayer["read"]): MapLayer => ({
  key,
  owner: key.split(".")[0],
  label: key,
  classification: "INTERNAL",
  doors: ["field"],
  offline: "live",
  style,
  read,
});

const opts = { background: "rgb(255, 255, 255)", foreground: "rgb(1, 2, 3)", door: "field" as const };

describe("layerOrder", () => {
  it("draws raster, then polygons, lines, heat and points, keeping the registry order within a kind", () => {
    const ordered = layerOrder([
      layer("a.points", { kind: "point", color: "c" }),
      layer("a.heat", { kind: "heat" }),
      layer("a.lines", { kind: "line", color: "c" }),
      layer("b.points", { kind: "point", color: "c" }),
      layer("a.areas", { kind: "polygon", color: "c" }),
      layer("a.tiles", { kind: "raster", tiles: ["t"] }),
    ]);
    expect(ordered.map((l) => l.key)).toEqual(["a.tiles", "a.areas", "a.lines", "a.heat", "a.points", "b.points"]);
  });
});

describe("firstSymbolLayerId", () => {
  it("names the basemap's first label layer, or nothing on a style without labels", () => {
    expect(
      firstSymbolLayerId({
        layers: [
          { id: "land", type: "fill", source: "s" },
          { id: "road", type: "line", source: "s" },
          { id: "road-label", type: "symbol", source: "s" },
          { id: "place-label", type: "symbol", source: "s" },
        ],
      })
    ).toBe("road-label");
    expect(firstSymbolLayerId({ layers: [{ id: "ground", type: "background" }] })).toBeUndefined();
    expect(firstSymbolLayerId(undefined)).toBeUndefined();
  });
});

describe("layer ids and specs", () => {
  it("names one source and the layers per kind, points with clusters and a halo under the symbol", () => {
    expect(sourceId("a.points")).toBe("layer:a.points");
    expect(layerIds(layer("a.points", { kind: "point", color: "c" }))).toEqual(["layer:a.points:cluster", "layer:a.points:cluster-count", "layer:a.points:halo", "layer:a.points:point"]);
    expect(layerIds(layer("a.areas", { kind: "polygon", color: "c" }))).toEqual(["layer:a.areas:fill", "layer:a.areas:outline"]);
    expect(layerIds(layer("a.areas", { kind: "polygon", color: "c", outline: false }))).toEqual(["layer:a.areas:fill"]);
    expect(layerIds(layer("a.tiles", { kind: "raster", tiles: ["t"] }))).toEqual(["layer:a.tiles:raster"]);
  });

  it("draws a point without an icon as a dot, with the resolved colours given and never a literal of its own", () => {
    const specs = layerSpecs(layer("a.points", { kind: "point", color: "rgb(9, 9, 9)", radius: 5 }), opts);
    expect(specs.map((s) => s.id)).toEqual(["layer:a.points:cluster", "layer:a.points:cluster-count", "layer:a.points:halo", "layer:a.points:point"]);
    expect(specs[3]).toMatchObject({ type: "circle", source: "layer:a.points", paint: { "circle-radius": 5, "circle-color": "rgb(9, 9, 9)", "circle-stroke-color": "rgb(255, 255, 255)" } });
    expect(JSON.stringify(specs[2])).toContain('"feature-state","selected"');
    expect(JSON.stringify(specs)).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("draws a point with an icon as a symbol from the sprite named by the feature, labelled with collision", () => {
    const specs = layerSpecs(layer("a.points", { kind: "point", color: "c", icon: "icon", label: "label", spriteSize: 32 }), opts);
    const symbol = specs[3];
    expect(symbol.type).toBe("symbol");
    expect(symbol).toMatchObject({
      layout: { "icon-image": ["get", "icon"], "text-field": ["coalesce", ["get", "label"], ""], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": "rgb(1, 2, 3)", "text-halo-color": "rgb(255, 255, 255)" },
    });
    expect((symbol as { layout: Record<string, unknown> }).layout["icon-allow-overlap"]).toEqual(["step", ["zoom"], true, 13, false]);
    expect(specs[0]).toMatchObject({ type: "circle", filter: ["has", "point_count"] });
    expect(specs[1]).toMatchObject({ type: "symbol", layout: { "text-field": ["get", "point_count_abbreviated"] } });
  });

  it("paints lines, heat and polygons from their style", () => {
    const line = layerSpecs(layer("a.lines", { kind: "line", color: "c", width: 4, dash: [2, 1] }), opts)[0];
    expect(line).toMatchObject({ type: "line", paint: { "line-color": "c", "line-width": 4, "line-dasharray": [2, 1] } });
    expect(layerSpecs(layer("a.heat", { kind: "heat", weight: "n" }), opts)[0]).toMatchObject({ type: "heatmap" });
    expect(JSON.stringify(layerSpecs(layer("a.areas", { kind: "polygon", color: "c" }), opts))).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("lists the point and cluster layers for hit testing and the sources that may hold a selection", () => {
    const layers = [layer("a.points", { kind: "point", color: "c" }), layer("a.tiles", { kind: "raster", tiles: ["t"] }), layer("a.lines", { kind: "line", color: "c" })];
    expect(pointLayerIds(layers)).toEqual(["layer:a.points:point", "layer:a.points:cluster"]);
    expect(featureSourceIds(layers)).toEqual(["layer:a.points", "layer:a.lines"]);
  });
});

describe("sizes on the Field floor", () => {
  it("never draws a symbol under the icon floor at any zoom", () => {
    for (const spriteSize of [16, 24, 32, 48]) {
      const expr = iconSizeExpression(spriteSize);
      expect(minimumOf(expr) * spriteSize).toBeGreaterThanOrEqual(ICON_MIN_PX);
    }
  });

  it("never draws a label under the text floor on the Field and Station doors, and lets the desk go smaller", () => {
    expect(minimumOf(labelTextSize("field"))).toBeGreaterThanOrEqual(FIELD_TEXT_PX);
    expect(minimumOf(labelTextSize("station"))).toBeGreaterThanOrEqual(FIELD_TEXT_PX);
    expect(minimumOf(labelTextSize("admin"))).toBeLessThan(FIELD_TEXT_PX);
  });

  it("floors a basemap label's own size, whatever shape it came in", () => {
    expect(minimumOf(flooredTextSize(12, FIELD_TEXT_PX))).toBe(FIELD_TEXT_PX);
    expect(minimumOf(flooredTextSize(["interpolate", ["linear"], ["zoom"], 10, 9, 16, 14], FIELD_TEXT_PX))).toBe(FIELD_TEXT_PX);
    expect(minimumOf(flooredTextSize(undefined, FIELD_TEXT_PX))).toBe(FIELD_TEXT_PX);
  });

  it("hits within half a tap target of the point", () => {
    expect(HIT_PAD_PX * 2).toBe(FIELD_TARGET_PX);
  });
});

describe("clustering", () => {
  it("clusters a point layer past the threshold, or as it says", () => {
    expect(CLUSTER_THRESHOLD).toBe(300);
    const auto = layer("a.points", { kind: "point", color: "c" });
    expect(shouldCluster(auto, 300)).toBe(false);
    expect(shouldCluster(auto, 301)).toBe(true);
    expect(shouldCluster(layer("a.points", { kind: "point", color: "c", cluster: "never" }), 5000)).toBe(false);
    expect(shouldCluster(layer("a.points", { kind: "point", color: "c", cluster: "always" }), 1)).toBe(true);
    expect(shouldCluster(layer("a.lines", { kind: "line", color: "c" }), 5000)).toBe(false);
  });

  it("reads a tap as distinct keys, or as the cluster to open", () => {
    expect(hitsOf([{ properties: { key: "a" } }, { properties: { key: "b" } }, { properties: { key: "a" } }])).toEqual({ keys: ["a", "b"], cluster: null });
    expect(hitsOf([{ properties: { cluster: true, cluster_id: 7, point_count: 12 }, source: "layer:x" }])).toEqual({ keys: [], cluster: { source: "layer:x", id: 7 } });
    expect(hitsOf([])).toEqual({ keys: [], cluster: null });
  });
});

describe("createReadScheduler", () => {
  const bounds = { west: 0, south: 0, east: 1, north: 1 };
  const empty: LayerFeatures = { type: "FeatureCollection", features: [] };
  /** Lets every promise chain in flight finish. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("reads each layer with the bounds, the window and a signal, and reports the result by key", async () => {
    const read = vi.fn(async () => empty);
    const onResult = vi.fn();
    const scheduler = createReadScheduler();
    scheduler.run([layer("a.points", { kind: "point", color: "c" }, read)], bounds, { since: "2026-01-01T00:00:00.000Z" }, onResult, vi.fn());
    expect(read).toHaveBeenCalledWith(bounds, { since: "2026-01-01T00:00:00.000Z" }, expect.any(AbortSignal));
    await settle();
    expect(onResult).toHaveBeenCalledWith("a.points", empty);
    expect(scheduler.inFlight("a.points")).toBeUndefined();
  });

  it("aborts the read in flight for a layer when the view moves again, and drops its late answer", async () => {
    let finishFirst!: (v: LayerFeatures) => void;
    const first = new Promise<LayerFeatures>((r) => (finishFirst = r));
    const read = vi.fn<NonNullable<MapLayer["read"]>>().mockReturnValueOnce(first).mockResolvedValueOnce(empty);
    const onResult = vi.fn();
    const scheduler = createReadScheduler();
    const l = layer("a.points", { kind: "point", color: "c" }, read);
    scheduler.run([l], bounds, {}, onResult, vi.fn());
    const firstSignal = read.mock.calls[0][2];
    scheduler.run([l], { ...bounds, east: 2 }, {}, onResult, vi.fn());
    expect(firstSignal.aborted).toBe(true);
    expect(read.mock.calls[1][2].aborted).toBe(false);
    finishFirst({ type: "FeatureCollection", features: [{ type: "Feature", properties: { key: "late" }, geometry: { type: "Point", coordinates: [0, 0] } }] });
    await settle();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("a.points", empty);
  });

  it("reports a failed read by key, skips a layer with no read, and stops everything on request", async () => {
    const onProblem = vi.fn();
    const scheduler = createReadScheduler();
    const failing = layer("a.points", { kind: "point", color: "c" }, async () => {
      throw new Error("no signal");
    });
    scheduler.run([failing, layer("a.tiles", { kind: "raster", tiles: ["t"] })], bounds, {}, vi.fn(), onProblem);
    await settle();
    expect(onProblem).toHaveBeenCalledWith("a.points", "no signal");
    const slow = layer("b.points", { kind: "point", color: "c" }, () => new Promise(() => {}));
    scheduler.run([slow], bounds, {}, vi.fn(), vi.fn());
    const signal = scheduler.inFlight("b.points")!.signal;
    scheduler.stop();
    expect(signal.aborted).toBe(true);
    expect(scheduler.inFlight("b.points")).toBeUndefined();
  });
});
