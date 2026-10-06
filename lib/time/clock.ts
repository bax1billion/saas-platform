/**
 * agencyClock — the one place a tenant's day boundaries become instants.
 * A duty day is identified by its tenant-local start
 * date; instants are stored UTC; the agency's IANA zone comes from
 * `Organization.settings.timezone`. No other code may do raw local-time
 * arithmetic.
 *
 * Pure: Intl only, no DOM, no Next. Shared by the calendar (client) and
 * module Lambdas (server), so both sides agree on what "today"
 * and "07:30" mean.
 */
import { addDays, parseIsoDate, toIsoDate, type IsoDate } from "./iso-date";

/**
 * Used when the org has not set `settings.timezone`. A guess is
 * unavoidable — the Lambda has no browser to ask — so HQ shows a warning
 * until an Admin sets the real zone. Pacific is only a placeholder; a
 * product picks its own default.
 */
export const DEFAULT_AGENCY_TIMEZONE = "America/Los_Angeles";

const MS_PER_HOUR = 3_600_000;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `Organization.settings.timezone`, or the default when unset/invalid. */
export function orgTimezone(settings: { timezone?: unknown } | null | undefined): string {
  return isValidTimeZone(settings?.timezone) ? settings.timezone : DEFAULT_AGENCY_TIMEZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface WallClock {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

/** The wall-clock reading in `tz` at a given instant. */
export function wallClock(instant: Date, tz: string): WallClock {
  const parts = formatter(tz).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), ss: get("second") };
}

/** Zone offset at `instant`, as (local − UTC) in milliseconds. */
export function zoneOffsetMs(instant: Date, tz: string): number {
  const w = wallClock(instant, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a wall-clock time occurs in `tz`. Two passes so a
 * time near a DST transition resolves against the offset in force then.
 * A wall time that does not exist (spring-forward gap) resolves to the
 * instant after the gap; an ambiguous one (fall-back) to the first.
 */
export function toInstant(tz: string, y: number, m: number, d: number, hh = 0, mm = 0): Date {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = asUtc - zoneOffsetMs(new Date(asUtc), tz);
  guess = asUtc - zoneOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

export interface ShiftInterval {
  startAt: string;
  endAt: string;
  /** Actual elapsed hours; differs from the nominal hours across DST. */
  elapsedHours: number;
  /** DST-affected intervals are flagged so a policy can treat them differently. */
  dstAffected: boolean;
}

export interface AgencyClock {
  timezone: string;
  /** Agency-local calendar date for an instant (default: now). */
  today(now?: Date): IsoDate;
  /** Agency-local wall clock for an instant (default: now). */
  now(at?: Date): WallClock;
  /**
   * The interval a shift-day entry covers: `hours` of wall-clock time from
   * the agency's shift change on `shiftDate`. Boundaries are local; the
   * stored instants are UTC (SH-CORE-3).
   */
  shiftInterval(shiftDate: IsoDate, shiftStartLocal: string, hours: number): ShiftInterval;
}

export function agencyClock(timezone: string = DEFAULT_AGENCY_TIMEZONE): AgencyClock {
  const tz = isValidTimeZone(timezone) ? timezone : DEFAULT_AGENCY_TIMEZONE;
  return {
    timezone: tz,
    today(now = new Date()) {
      const w = wallClock(now, tz);
      return toIsoDate(w.y, w.m, w.d);
    },
    now(at = new Date()) {
      return wallClock(at, tz);
    },
    shiftInterval(shiftDate, shiftStartLocal, hours) {
      const { y, m, d } = parseIsoDate(shiftDate);
      const [hh, mm] = shiftStartLocal.split(":").map(Number);
      const start = toInstant(tz, y, m, d, hh || 0, mm || 0);
      const totalMin = (hh || 0) * 60 + (mm || 0) + Math.round(hours * 60);
      const endDate = addDays(shiftDate, Math.floor(totalMin / 1440));
      const e = parseIsoDate(endDate);
      const endMin = totalMin % 1440;
      const end = toInstant(tz, e.y, e.m, e.d, Math.floor(endMin / 60), endMin % 60);
      const elapsedHours = (end.getTime() - start.getTime()) / MS_PER_HOUR;
      return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        elapsedHours,
        dstAffected: Math.abs(elapsedHours - hours) > 1e-9,
      };
    },
  };
}
