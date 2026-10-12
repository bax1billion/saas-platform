import { describe, expect, it } from "vitest";
import { adminHomeFor, doorFor, isAdminPath, offeredDoors, type ChosenDoor } from "./door";

const bases = ["/run", "/ready", "/station"];

describe("isAdminPath", () => {
  it("matches /<product>/admin and deeper for a registered product", () => {
    expect(isAdminPath("/run/admin", bases)).toBe(true);
    expect(isAdminPath("/run/admin/review-queue", bases)).toBe(true);
    expect(isAdminPath("/ready/admin/hour-targets", bases)).toBe(true);
    expect(isAdminPath("/station/admin/rules", bases)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAdminPath("/run", bases)).toBe(false);
    expect(isAdminPath("/run/adminx", bases)).toBe(false);
    expect(isAdminPath("/settings/admin", bases)).toBe(false);
    expect(isAdminPath("/", bases)).toBe(false);
    expect(isAdminPath("/admin", bases)).toBe(false);
  });
});

describe("doorFor", () => {
  it("follows the pointer when nothing is chosen", () => {
    expect(doorFor({ pointer: "station", chosen: null, adminUrl: false, isAdmin: false })).toEqual({ door: "station", adminBlocked: false });
    expect(doorFor({ pointer: "field", chosen: null, adminUrl: false, isAdmin: true })).toEqual({ door: "field", adminBlocked: false });
  });

  it("lets a choice beat the pointer", () => {
    expect(doorFor({ pointer: "station", chosen: "field", adminUrl: false, isAdmin: true }).door).toBe("field");
    expect(doorFor({ pointer: "field", chosen: "station", adminUrl: false, isAdmin: false }).door).toBe("station");
  });

  it("gives an Admin the Admin door on an Admin URL whatever the choice", () => {
    expect(doorFor({ pointer: "field", chosen: "field", adminUrl: true, isAdmin: true })).toEqual({ door: "admin", adminBlocked: false });
  });

  it("never gives a non-Admin the Admin door and flags the block", () => {
    expect(doorFor({ pointer: "station", chosen: null, adminUrl: true, isAdmin: false })).toEqual({ door: "station", adminBlocked: true });
    expect(doorFor({ pointer: "station", chosen: "field", adminUrl: true, isAdmin: false })).toEqual({ door: "field", adminBlocked: true });
    expect(doorFor({ pointer: "station", chosen: null, adminUrl: false, isAdmin: false }).adminBlocked).toBe(false);
  });
});

describe("offeredDoors and adminHomeFor", () => {
  const homes = { run: "/run/admin" };
  it("offers Admin only to an Admin on a product with an Admin home", () => {
    expect(offeredDoors(false, "/run/admin")).toEqual(["field", "station"]);
    expect(offeredDoors(true, null)).toEqual(["field", "station"]);
    expect(offeredDoors(true, "/run/admin")).toEqual(["field", "station", "admin"]);
  });
  it("finds a home by module id and null otherwise", () => {
    expect(adminHomeFor("run", homes)).toBe("/run/admin");
    expect(adminHomeFor("shift", homes)).toBeNull();
    expect(adminHomeFor(undefined, homes)).toBeNull();
  });
});

/**
 * Parity with the per-module door contexts the provider replaced on Oct 6,
 * 2026 (one module read Admin from its route, another never did; both
 * since deleted). Their formulas are copied here as the behaviour contract
 * the frame inherited.
 */
type LegacyDoor = "field" | "station" | "admin";
function legacyRoutedDoor(fsMode: ChosenDoor, manual: LegacyDoor | null, onAdminRoute: boolean): LegacyDoor {
  return onAdminRoute ? "admin" : manual === "admin" ? fsMode : (manual ?? fsMode);
}
function legacyPlainDoor(fsMode: ChosenDoor, manual: LegacyDoor | null): LegacyDoor {
  return manual ?? fsMode;
}

describe("parity with the legacy module contexts (Admin member)", () => {
  const pointers: ChosenDoor[] = ["field", "station"];
  const manuals: (LegacyDoor | null)[] = [null, "field", "station", "admin"];
  it("gives the routed context's answer for every combination", () => {
    for (const pointer of pointers)
      for (const manual of manuals)
        for (const adminUrl of [true, false]) {
          // A legacy manual "admin" off an Admin URL fell back to the pointer; the
          // new rule never stores admin, so it maps to "no choice".
          const chosen: ChosenDoor | null = manual === "admin" ? null : manual;
          expect(doorFor({ pointer, chosen, adminUrl, isAdmin: true }).door, `${pointer} ${manual} ${adminUrl}`).toBe(
            legacyRoutedDoor(pointer, manual, adminUrl)
          );
        }
  });
  it("gives the plain context's answer off the Admin URL for Field and Station choices", () => {
    for (const pointer of pointers)
      for (const manual of [null, "field", "station"] as const) {
        expect(doorFor({ pointer, chosen: manual, adminUrl: false, isAdmin: true }).door).toBe(legacyPlainDoor(pointer, manual));
      }
  });
  it("differs on purpose for a non-Admin on an Admin URL", () => {
    expect(legacyRoutedDoor("station", null, true)).toBe("admin");
    expect(doorFor({ pointer: "station", chosen: null, adminUrl: true, isAdmin: false }).door).toBe("station");
  });
});
