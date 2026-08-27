/**
 * Helpers for `a.json()` (AWSJSON) fields. AppSync transports them as JSON
 * strings and the Amplify client does not (de)serialize them, so write
 * with `toJsonField` and read with `parseJsonField`, which also tolerates
 * already-parsed values.
 */

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toJsonField(value: unknown): string {
  return JSON.stringify(value);
}
