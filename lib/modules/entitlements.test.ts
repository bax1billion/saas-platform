import { describe, expect, it } from "vitest";
import { resolveEntitledModules } from "./index";
import type { ModuleDef } from "./types";

/** Minimal ModuleDef for tests — only fields the resolver reads matter. */
const def = (id: string, availability: ModuleDef["availability"]): ModuleDef =>
  ({
    id,
    availability,
    name: id,
    tagline: "",
    description: "",
    icon: (() => null) as unknown as ModuleDef["icon"],
    accent: "",
    basePath: `/${id}`,
    nav: [],
    stage: "ga",
    marketing: { headline: "", bullets: [] },
  }) as ModuleDef;

const registry = [
  def("core-tools", "included"),
  def("alpha", "addon"),
  def("beta", "addon"),
  def("future", "coming-soon"),
];

describe("resolveEntitledModules", () => {
  it("included modules require an active subscription", () => {
    expect(
      resolveEntitledModules({ hasActiveSubscription: true }, registry)
    ).toEqual(new Set(["core-tools"]));
    expect(
      resolveEntitledModules({ hasActiveSubscription: false }, registry)
    ).toEqual(new Set());
  });

  it("addons come from subscription line items or org overrides", () => {
    expect(
      resolveEntitledModules(
        {
          hasActiveSubscription: true,
          subscriptionModules: ["alpha"],
          orgModules: ["beta"],
        },
        registry
      )
    ).toEqual(new Set(["core-tools", "alpha", "beta"]));
  });

  it("addon grants work without an active subscription (comped module)", () => {
    expect(
      resolveEntitledModules(
        { hasActiveSubscription: false, orgModules: ["alpha"] },
        registry
      )
    ).toEqual(new Set(["alpha"]));
  });

  it("coming-soon modules are never entitled", () => {
    expect(
      resolveEntitledModules(
        {
          hasActiveSubscription: true,
          subscriptionModules: ["future"],
          orgModules: ["future"],
        },
        registry
      ).has("future")
    ).toBe(false);
  });

  it("grants for unregistered ids are ignored", () => {
    expect(
      resolveEntitledModules(
        { hasActiveSubscription: false, orgModules: ["ghost"] },
        registry
      )
    ).toEqual(new Set());
  });
});
