import { describe, expect, it } from "vitest";
import { Map } from "lucide-react";
import type { ModuleDef } from "./types";
import { applyStageOverrides, parseStageOverrides } from "./stage-overrides";

const preview: ModuleDef = {
  id: "widgets",
  name: "Widgets",
  tagline: "t",
  description: "d",
  icon: Map,
  accent: "var(--module-widgets)",
  basePath: "/widgets",
  nav: [],
  availability: "addon",
  stage: "planned",
  marketing: { headline: "h", bullets: ["b"] },
};

const beta: ModuleDef = { ...preview, id: "reports", stage: "beta", price: "$149" };

describe("parseStageOverrides", () => {
  it("reads id=stage:price entries and ignores what it cannot use", () => {
    expect(parseStageOverrides("widgets=beta:$149, billing=beta ,nope,maps=later,forms=ga:$1,200")).toEqual({
      widgets: { stage: "beta", price: "$149" },
      billing: { stage: "beta" },
      forms: { stage: "ga", price: "$1" },
    });
    expect(parseStageOverrides(undefined)).toEqual({});
    expect(parseStageOverrides("")).toEqual({});
  });
});

describe("applyStageOverrides", () => {
  it("returns the registry untouched without overrides", () => {
    const mods = [preview, beta];
    expect(applyStageOverrides(mods, undefined)).toBe(mods);
  });

  it("flips a preview to beta with its display price", () => {
    const [s] = applyStageOverrides([preview], "widgets=beta:$149");
    expect(s.stage).toBe("beta");
    expect(s.price).toBe("$149");
    expect(preview.stage).toBe("planned");
  });

  it("drops the price when a module is sent back to planned", () => {
    const [r] = applyStageOverrides([beta], "reports=planned");
    expect(r.stage).toBe("planned");
    expect(r.price).toBeUndefined();
  });

  it("leaves other modules alone", () => {
    const [, r] = applyStageOverrides([preview, beta], "widgets=beta:$149");
    expect(r).toBe(beta);
  });
});
