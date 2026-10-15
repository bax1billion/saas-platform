import { describe, expect, it, vi } from "vitest";
import { CLASSIFICATIONS, SHAREABLE_CLASSIFICATIONS, type MapLayer } from "./contract";
import { createRegistry, type Entitlements } from "./registry";

const read = vi.fn(async () => ({ type: "FeatureCollection" as const, features: [] }));

const layer = (over: Partial<MapLayer>): MapLayer => ({
  key: "one.points",
  owner: "one",
  label: "Points",
  classification: "INTERNAL",
  doors: ["field", "station", "admin"],
  offline: "live",
  style: { kind: "point", color: "c" },
  read,
  ...over,
});

const entitlements = (held: string[]): Entitlements => ({ has: (id) => held.includes(id), label: (id) => id.toUpperCase() });

describe("classification", () => {
  it("is the package's seven labels, and only two of them may ever leave", () => {
    expect(CLASSIFICATIONS).toEqual(["PUBLIC", "INTERNAL", "RESTRICTED", "EMS_OPERATIONAL", "EMS_SENSITIVE", "PERSONNEL_LOCATION", "EVIDENCE"]);
    expect(SHAREABLE_CLASSIFICATIONS).toEqual(["PUBLIC", "INTERNAL"]);
  });
});

describe("createRegistry", () => {
  const layers = [
    layer({ key: "one.points", defaultOn: { field: true } }),
    layer({ key: "one.areas", style: { kind: "polygon", color: "c" }, doors: ["station", "admin"] }),
    layer({ key: "two.lines", owner: "two", style: { kind: "line", color: "c" } }),
    layer({ key: "one.later", live: false }),
  ];

  it("refuses a key registered twice", () => {
    expect(() => createRegistry([layer({}), layer({})])).toThrow(/twice/);
  });

  it("lists for a door only the layers that name it", () => {
    const rows = createRegistry(layers).forDoor("field", entitlements(["one", "two"]));
    expect(rows.map((r) => r.layer.key)).toEqual(["one.points", "two.lines", "one.later"]);
  });

  it("lists an unheld owner's layer as off with the note, and a layer not built yet, and never reads either", () => {
    const rows = createRegistry(layers).forDoor("station", entitlements(["one"]));
    const lines = rows.find((r) => r.layer.key === "two.lines")!;
    expect(lines.available).toBe(false);
    expect(lines.note).toBe("Turn on TWO to see this");
    const later = rows.find((r) => r.layer.key === "one.later")!;
    expect(later).toMatchObject({ available: false, note: "Not built yet" });
    const visible = createRegistry(layers).visible(rows, "station", { "two.lines": true, "one.later": true });
    expect(visible).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("draws the available rows the state has on, falling back to the door's default when the state is silent", () => {
    const registry = createRegistry(layers);
    const rows = registry.forDoor("field", entitlements(["one", "two"]));
    expect(registry.defaults("field")).toEqual({ "one.points": true, "two.lines": false, "one.later": false });
    expect(registry.visible(rows, "field", {}).map((l) => l.key)).toEqual(["one.points"]);
    expect(registry.visible(rows, "field", { "one.points": false, "two.lines": true }).map((l) => l.key)).toEqual(["two.lines"]);
  });
});
