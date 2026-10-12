"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { idbAvailable, openIdbStore } from "./idb-store";
import { Outbox, type OutboxStatus } from "./outbox";
import { looksOffline, overlay } from "./queue";
import { memoryStore, type OfflineStore } from "./store";
import type { OutboxExecutor, OutboxOp, Row } from "./types";

/**
 * One outbox per signed-in person and organization, for the whole app, so
 * queued work keeps sending while the person is on any screen. Mounted in
 * the signed-in layout with every scope's sender (config/offline.ts), so a
 * module's writes go out even when none of its screens is open.
 */
const OutboxContext = createContext<Outbox | null>(null);

async function openStore(namespace: string): Promise<OfflineStore> {
  if (!idbAvailable()) return memoryStore();
  try {
    return await openIdbStore(namespace);
  } catch (err) {
    // Private browsing on some browsers refuses IndexedDB. Keep working in
    // memory; the sync pill says queued work will not survive a reload.
    console.error("Offline store unavailable, using memory", err);
    return memoryStore();
  }
}

const RETRY_TICK_MS = 15_000;

export function OutboxProvider({
  namespace,
  senders,
  children,
}: {
  namespace: string | null;
  /** Sender per scope. Keep this object stable (a module-level constant). */
  senders: Readonly<Record<string, OutboxExecutor>>;
  children: ReactNode;
}) {
  const [outbox, setOutbox] = useState<Outbox | null>(null);

  useEffect(() => {
    if (!namespace) return;
    let cancelled = false;
    let made: Outbox | null = null;
    openStore(namespace).then((store) => {
      if (cancelled) return;
      made = new Outbox({ store });
      setOutbox(made);
    });
    return () => {
      cancelled = true;
      setOutbox((cur) => (cur === made ? null : cur));
    };
  }, [namespace]);

  useEffect(() => {
    if (!outbox) return;
    const offs = Object.entries(senders).map(([scope, sender]) => outbox.register(scope, sender));
    return () => offs.forEach((off) => off());
  }, [outbox, senders]);

  useEffect(() => {
    if (!outbox) return;
    const online = () => outbox.setOnline(true);
    const offline = () => outbox.setOnline(false);
    const focus = () => document.visibilityState === "visible" && void outbox.flush();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", focus);
    const tick = window.setInterval(() => void outbox.flush(), RETRY_TICK_MS);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
      window.clearInterval(tick);
    };
  }, [outbox]);

  return <OutboxContext.Provider value={outbox}>{children}</OutboxContext.Provider>;
}

/** The app's outbox, or null while it opens (and when signed out). */
export function useOutbox(): Outbox | null {
  return useContext(OutboxContext);
}

const IDLE: OutboxStatus = {
  pending: 0,
  conflicts: 0,
  failed: 0,
  unsent: [],
  online: true,
  syncing: false,
  lastSyncedAt: null,
  durable: true,
};

export function useOutboxStatus(): OutboxStatus {
  const outbox = useOutbox();
  return useSyncExternalStore(
    (cb) => (outbox ? outbox.subscribe(() => cb()) : () => {}),
    () => outbox?.getStatus() ?? IDLE,
    () => IDLE
  );
}

export interface OfflineList<T extends Row> {
  /** The list as this device should show it; null while loading. */
  rows: T[] | null;
  /** Loaded from the device copy because there was no signal. */
  fromDevice: boolean;
  /** When the copy shown was taken from the server. */
  savedAt: string | null;
  /** No signal and this device never loaded the list. */
  missing: boolean;
  /** Takes a row pushed by the server (a subscription) into the server copy. */
  mergeRow: (row: T) => void;
  reload: () => void;
}

/**
 * A list that works with no signal: loaded through the outbox (server,
 * else the device copy) with this device's unsent writes on top. `filter`
 * keeps a per-parent list to its parent, since queued creates of the same
 * model for other parents would otherwise appear in it. `fetchRows` must be
 * stable (useCallback); the list reloads when it or `key` changes.
 */
export function useOfflineList<T extends Row>(opts: {
  key: string | null;
  model: string;
  fetchRows: () => Promise<T[]>;
  filter?: (row: T) => boolean;
  onError?: (err: unknown) => void;
}): OfflineList<T> {
  const { key, model, fetchRows, filter, onError } = opts;
  const outbox = useOutbox();
  const status = useOutboxStatus();
  // The server copy, tagged with the key it was loaded for, so switching
  // parents never shows the previous parent's rows while the next loads.
  const [loaded, setLoaded] = useState<{ key: string; rows: T[] } | null>(null);
  const base = loaded && loaded.key === key ? loaded.rows : null;
  const setBase = useCallback(
    (fn: (prev: T[] | null) => T[] | null) =>
      setLoaded((cur) => {
        if (!cur) return cur;
        const rows = fn(cur.rows);
        return rows ? { key: cur.key, rows } : cur;
      }),
    []
  );
  const [meta, setMeta] = useState({ fromDevice: false, savedAt: null as string | null, missing: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!outbox || !key) return;
    let cancelled = false;
    outbox
      .readThrough(key, fetchRows)
      .then((res) => {
        if (cancelled) return;
        setLoaded({ key, rows: res?.rows ?? [] });
        setMeta({ fromDevice: res?.fromDevice ?? true, savedAt: res?.savedAt ?? null, missing: !res });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({ key, rows: [] });
        setMeta({ fromDevice: false, savedAt: null, missing: looksOffline(err) });
        onError?.(err);
      });
    return () => {
      cancelled = true;
    };
    // onError is a notification only; a new closure must not reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox, key, fetchRows, nonce]);

  // A write the server confirmed becomes part of the server copy.
  useEffect(() => {
    if (!outbox) return;
    return outbox.onSettled((op: OutboxOp) => {
      if (op.model !== model || op.state !== "sent") return;
      setBase((prev) => (prev ? overlay(prev, [{ ...op, state: "pending" }], model) : prev));
    });
  }, [outbox, model, setBase]);

  // Recompute only when this model's unsent writes change, so the list keeps
  // its identity (a map does not rebuild its markers) on unrelated updates.
  const mine = status.unsent.filter((o) => o.model === model);
  const signature = mine.map((o) => `${o.opId}:${o.state}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ops = useMemo(() => mine, [signature]);
  const rows = useMemo(() => {
    if (!base) return null;
    const all = overlay(base, ops, model);
    return filter ? all.filter(filter) : all;
    // `filter` is read fresh on each recompute; callers pass an inline arrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ops, model]);

  const mergeRow = useCallback(
    (row: T) =>
      setBase((prev) => {
        if (!prev) return prev;
        return prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...prev, row];
      }),
    [setBase]
  );
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { rows, ...meta, mergeRow, reload };
}
