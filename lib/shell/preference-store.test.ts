import { describe, expect, it, vi } from "vitest";
import {
  clearShellPreference,
  primeShellPreference,
  readShellExtra,
  readShellPreference,
  subscribeShellPreference,
  writeShellExtra,
  writeShellPreference,
} from "./preference-store";

// Vitest runs in node: there is no `window`, which is exactly the blocked
// storage case the store has to survive.
describe("shell preference store without storage", () => {
  it("reads the default and does not throw on write", () => {
    clearShellPreference();
    expect(readShellPreference()).toEqual({ sidebar: null, door: null, textSize: "standard", basemap: "streets", extras: {} });
    expect(() => writeShellPreference({ door: "field" })).not.toThrow();
    expect(readShellPreference().door).toBe("field");
  });

  it("returns the same snapshot between writes", () => {
    const a = readShellPreference();
    expect(readShellPreference()).toBe(a);
    writeShellPreference({ sidebar: "compact" });
    expect(readShellPreference()).not.toBe(a);
    expect(readShellPreference().sidebar).toBe("compact");
  });

  it("notifies subscribers once per write and prime, and unsubscribes", () => {
    const cb = vi.fn();
    const off = subscribeShellPreference(cb);
    writeShellPreference({ textSize: "large" });
    primeShellPreference({ door: "station" });
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    writeShellPreference({ textSize: "standard" });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("lets the stored row win over an earlier local value", () => {
    writeShellPreference({ door: "field" });
    primeShellPreference({ door: "station" });
    expect(readShellPreference().door).toBe("station");
  });

  it("never stores admin as a door and drops unknown values", () => {
    writeShellPreference({ door: "admin" as never, sidebar: "wide" as never, textSize: "huge" as never });
    expect(readShellPreference()).toEqual({ sidebar: null, door: null, textSize: "standard", basemap: "streets", extras: {} });
  });

  it("keeps a product's small choices under their own keys, strings only", () => {
    clearShellPreference();
    expect(readShellExtra("atlas.layers")).toBeNull();
    writeShellExtra("atlas.layers", '{"places":false}');
    writeShellExtra("atlas.heat", "7d");
    expect(readShellExtra("atlas.layers")).toBe('{"places":false}');
    expect(readShellPreference().extras).toEqual({ "atlas.layers": '{"places":false}', "atlas.heat": "7d" });
    writeShellExtra("atlas.heat", null);
    expect(readShellExtra("atlas.heat")).toBeNull();
    writeShellPreference({ extras: { ok: "1", bad: 2 as never, worse: { a: 1 } as never } });
    expect(readShellPreference().extras).toEqual({ ok: "1" });
    primeShellPreference({ door: "field" });
    expect(readShellExtra("ok")).toBe("1");
  });

  it("clears back to the default", () => {
    writeShellPreference({ door: "field", sidebar: "full", textSize: "largest" });
    clearShellPreference();
    expect(readShellPreference()).toEqual({ sidebar: null, door: null, textSize: "standard", basemap: "streets", extras: {} });
  });
});
