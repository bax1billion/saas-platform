/**
 * ISO local-date arithmetic. A calendar date (`YYYY-MM-DD`) is an identity,
 * never an instant: every function here works on Date.UTC so a daylight
 * saving change cannot move a day. Pure, no DOM, no Next; shared by client
 * code and Lambdas (imported by relative path from `amplify/`).
 */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;

export function parseIsoDate(iso: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return { y, m, d };
}

export function toIsoDate(y: number, m: number, d: number): IsoDate {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
}

/** Days since 1970-01-01 for a local calendar date. */
export function dayNumber(iso: IsoDate): number {
  const { y, m, d } = parseIsoDate(iso);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return new Date((dayNumber(iso) + n) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: IsoDate): number {
  const { y, m, d } = parseIsoDate(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The machine's local calendar date; prefer `agencyClock(tz).today()`
 *  (./clock) wherever a tenant's zone is known. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
