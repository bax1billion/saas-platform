import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENCY_TIMEZONE,
  agencyClock,
  isValidTimeZone,
  orgTimezone,
  toInstant,
  zoneOffsetMs,
} from "./clock";

describe("agencyClock", () => {
  it("resolves a wall-clock time in the agency zone to a UTC instant", () => {
    expect(toInstant("America/New_York", 2026, 7, 1, 12, 0).toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(toInstant("America/New_York", 2026, 1, 15, 12, 0).toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(zoneOffsetMs(new Date("2026-07-01T16:00:00Z"), "America/New_York")).toBe(-4 * 3_600_000);
  });

  it("names today by the agency's date, not the server's", () => {
    const la = agencyClock("America/Los_Angeles");
    expect(la.today(new Date("2026-09-10T03:00:00Z"))).toBe("2026-09-09");
    expect(agencyClock("Asia/Tokyo").today(new Date("2026-09-10T20:00:00Z"))).toBe("2026-09-11");
  });

  it("a 24-hour shift is 24 elapsed hours on an ordinary day", () => {
    const i = agencyClock("America/Los_Angeles").shiftInterval("2026-09-10", "07:30", 24);
    expect(i.startAt).toBe("2026-09-10T14:30:00.000Z");
    expect(i.endAt).toBe("2026-09-11T14:30:00.000Z");
    expect(i.elapsedHours).toBe(24);
    expect(i.dstAffected).toBe(false);
  });

  it("flags DST-affected shifts with their actual elapsed hours", () => {
    const c = agencyClock("America/Los_Angeles");
    const spring = c.shiftInterval("2026-03-07", "07:30", 24); // DST begins 2026-03-08
    expect(spring.elapsedHours).toBe(23);
    expect(spring.dstAffected).toBe(true);
    const fall = c.shiftInterval("2026-10-31", "07:30", 24); // DST ends 2026-11-01
    expect(fall.elapsedHours).toBe(25);
    expect(fall.dstAffected).toBe(true);
  });

  it("partial-day requests start at the shift change and run for the hours asked", () => {
    const i = agencyClock("America/Chicago").shiftInterval("2026-09-10", "07:30", 12);
    expect(i.startAt).toBe("2026-09-10T12:30:00.000Z");
    expect(i.endAt).toBe("2026-09-11T00:30:00.000Z");
  });

  it("falls back to the default zone when the org has not set one", () => {
    expect(isValidTimeZone("America/Denver")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(orgTimezone({})).toBe(DEFAULT_AGENCY_TIMEZONE);
    expect(orgTimezone({ timezone: "nope" })).toBe(DEFAULT_AGENCY_TIMEZONE);
    expect(orgTimezone({ timezone: "America/Denver" })).toBe("America/Denver");
    expect(agencyClock("nope").timezone).toBe(DEFAULT_AGENCY_TIMEZONE);
  });
});
