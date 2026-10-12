import { describe, expect, it } from "vitest";
import { BREAKPOINTS, layoutModeFor, type LayoutInput } from "./layout-mode";

const at = (width: number, door: LayoutInput["door"], extra: Partial<LayoutInput> = {}) =>
  layoutModeFor({ width, door, railOpen: false, manual: null, ...extra });

describe("layoutModeFor", () => {
  it("pins the breakpoints so a change is a deliberate edit", () => {
    expect(BREAKPOINTS).toEqual({ md: 768, lg: 1024, xl: 1280 });
  });

  it("gives a phone the toolbar whatever the door", () => {
    expect(at(390, "field")).toEqual({ device: "phone", nav: "toolbar", sidebar: "hidden" });
    expect(at(390, "station")).toEqual({ device: "phone", nav: "toolbar", sidebar: "hidden" });
    expect(at(390, "admin")).toEqual({ device: "phone", nav: "toolbar", sidebar: "hidden" });
  });

  it("gives a tablet in the Field door the toolbar and a desk door a compact rail", () => {
    expect(at(768, "field")).toEqual({ device: "tablet", nav: "toolbar", sidebar: "hidden" });
    expect(at(768, "station")).toEqual({ device: "tablet", nav: "sidebar", sidebar: "compact" });
    expect(at(1024, "admin")).toEqual({ device: "desktop", nav: "sidebar", sidebar: "compact" });
  });

  it("keeps the Field door on the toolbar until xl", () => {
    expect(at(1279, "field").nav).toBe("toolbar");
    expect(at(1280, "field")).toEqual({ device: "desktop", nav: "sidebar", sidebar: "full" });
  });

  it("opens FULL at xl and collapses to COMPACT while a section rail is open", () => {
    expect(at(1280, "station").sidebar).toBe("full");
    expect(at(1440, "station", { railOpen: true }).sidebar).toBe("compact");
  });

  it("lets a manual choice win whenever a sidebar is on screen", () => {
    expect(at(1440, "station", { railOpen: true, manual: "full" }).sidebar).toBe("full");
    expect(at(1440, "station", { manual: "compact" }).sidebar).toBe("compact");
    expect(at(800, "station", { manual: "full" }).sidebar).toBe("full");
  });

  it("never forces a sidebar onto a phone", () => {
    expect(at(390, "station", { manual: "full" }).sidebar).toBe("hidden");
  });
});
