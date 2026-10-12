/**
 * The member's shell preferences: sidebar choice, door choice, text size,
 * and the map basemap (streets or aerial), which every product's map reads.
 *
 * This is the one file in the client that touches `localStorage`
 * (`lib/shell/storage-guard.test.ts` fails any other). Storage is a
 * per-viewer convenience, never audited state: every call sits in
 * try/catch, and a private window or blocked storage still works for the
 * session because the in-memory copy is the source the hooks read.
 *
 * It is an external store in React's sense: `subscribeShellPreference` plus
 * `readShellPreference` feed `useSyncExternalStore`, so no component sets
 * state inside an effect to pick a stored value up.
 *
 * When a `MemberPreference` model lands (a schema change, docs/shell.md
 * Persistence), only this file changes: the row is read once and handed
 * to `primeShellPreference`, and `writeShellPreference` also updates the
 * row. The callers never change.
 */
import type { ManualSidebar } from "@/lib/hooks/layout-mode";

export type ChosenDoor = "field" | "station";
export type TextSize = "standard" | "large" | "largest";
export type Basemap = "streets" | "satellite";

export interface ShellPreference {
  /** `null` follows the layout rule. */
  sidebar: ManualSidebar;
  /** Admin is never stored: it is the URL. `null` follows the pointer guess. */
  door: ChosenDoor | null;
  textSize: TextSize;
  /** The basemap a map last showed this viewer; streets until they pick. */
  basemap: Basemap;
  /**
   * Small per-viewer choices a product keeps under a namespaced key
   * (`<module>.layers`), each a short string (JSON if it must). The store
   * never learns product fields; a product reads and writes through
   * `readShellExtra` / `writeShellExtra`.
   */
  extras: Record<string, string>;
}

const KEY = "ba.shell.v1";
const DEFAULT: ShellPreference = Object.freeze({ sidebar: null, door: null, textSize: "standard", basemap: "streets", extras: Object.freeze({}) });

let memory: ShellPreference | null = null;
const listeners = new Set<() => void>();

function normalize(raw: unknown): ShellPreference {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ShellPreference, unknown>>;
  return {
    sidebar: r.sidebar === "full" || r.sidebar === "compact" ? r.sidebar : null,
    door: r.door === "field" || r.door === "station" ? r.door : null,
    textSize: r.textSize === "large" || r.textSize === "largest" ? r.textSize : "standard",
    basemap: r.basemap === "satellite" ? "satellite" : "streets",
    extras: normalizeExtras(r.extras),
  };
}

/** String values only, under string keys; anything else is dropped. */
function normalizeExtras(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  }
  return out;
}

function readStored(): ShellPreference {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function notify() {
  listeners.forEach((l) => l());
}

/** Stable between writes, so it is safe as a `useSyncExternalStore` snapshot. */
export function readShellPreference(): ShellPreference {
  if (memory) return memory;
  if (typeof window === "undefined") return DEFAULT;
  memory = readStored();
  return memory;
}

export function writeShellPreference(patch: Partial<ShellPreference>): void {
  memory = normalize({ ...readShellPreference(), ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Private mode or blocked storage: the in-memory copy still holds it.
  }
  notify();
}

/** The stored row wins over the local copy when it arrives (docs/shell.md, Persistence). */
export function primeShellPreference(row: Partial<ShellPreference>): void {
  memory = normalize({ ...readShellPreference(), ...row });
  notify();
}

export function clearShellPreference(): void {
  memory = DEFAULT;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Same: nothing to remove, nothing to report.
  }
  notify();
}

/** A product's small per-viewer choice, or null when none is kept. */
export function readShellExtra(key: string): string | null {
  return readShellPreference().extras[key] ?? null;
}

/** Keep (or with null, forget) a product's small per-viewer choice. */
export function writeShellExtra(key: string, value: string | null): void {
  const extras = { ...readShellPreference().extras };
  if (value === null) delete extras[key];
  else extras[key] = value;
  writeShellPreference({ extras });
}

export function subscribeShellPreference(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Server snapshot: nothing is stored before hydration. */
export const SHELL_PREFERENCE_DEFAULT = DEFAULT;
