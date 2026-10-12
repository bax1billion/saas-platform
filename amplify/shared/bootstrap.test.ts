import { describe, expect, it } from "vitest";
import { composedModules, describeComposition } from "./bootstrap";

const all = ["widgets", "reports", "billing"];

describe("BACKEND_MODULES", () => {
  it("unset, empty or all composes every module", () => {
    expect([...composedModules(all, undefined)]).toEqual(all);
    expect([...composedModules(all, "")]).toEqual(all);
    expect([...composedModules(all, " all ")]).toEqual(all);
  });

  it("none composes the foundation alone", () => {
    expect(composedModules(all, "none").size).toBe(0);
  });

  it("a list composes exactly those modules, trimmed", () => {
    expect([...composedModules(all, " reports, billing ")]).toEqual(["reports", "billing"]);
  });

  it("an unknown id fails the synth with the known list", () => {
    expect(() => composedModules(all, "reports,gadgets")).toThrow(/gadgets.*known modules: widgets, reports, billing/);
  });

  it("describes the composition for the synth log", () => {
    expect(describeComposition(composedModules(all, undefined), all, undefined)).toBe("Backend composes every module (BACKEND_MODULES unset)");
    expect(describeComposition(composedModules(all, "none"), all, "none")).toBe("Backend composes the foundation alone (BACKEND_MODULES=none)");
    expect(describeComposition(composedModules(all, "reports"), all, "reports")).toBe("Backend composes reports (BACKEND_MODULES=reports)");
  });
});
