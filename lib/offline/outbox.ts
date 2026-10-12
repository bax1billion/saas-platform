import { applyResult, looksOffline, overlay, purgeable, rebaseAfter, sendable, summarize } from "./queue";
import type { OfflineStore } from "./store";
import type { OpKind, OutboxExecutor, OutboxOp, OutboxSummary, Row, SendResult } from "./types";

/**
 * The outbox runtime: stores each write on the device, then sends them in
 * order whenever there is signal. One instance per signed-in person and
 * organization (react.tsx makes it). Sends are single-flight; a send that
 * hits no signal stops the round and waits for the next trigger (back
 * online, the app regaining focus, or the retry timer).
 */
export interface EnqueueInput {
  scope: string;
  model: string;
  kind: OpKind;
  input: Row;
  base?: Record<string, unknown> | null;
  baseUpdatedAt?: string | null;
}

export interface OutboxStatus extends OutboxSummary {
  /** The device says it has a network. Not a promise the server is reachable. */
  online: boolean;
  syncing: boolean;
  /** Last time a round finished with nothing left to send (ISO). */
  lastSyncedAt: string | null;
  /** False when the browser has no durable storage: queued work is lost on reload. */
  durable: boolean;
}

export interface OutboxOptions {
  store: OfflineStore;
  isOnline?: () => boolean;
  now?: () => Date;
  newId?: () => string;
}

type Listener = (status: OutboxStatus) => void;
type OpListener = (op: OutboxOp) => void;

export class Outbox {
  private readonly store: OfflineStore;
  private readonly isOnline: () => boolean;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly executors = new Map<string, OutboxExecutor>();
  private readonly listeners = new Set<Listener>();
  private readonly settledListeners = new Set<OpListener>();
  private ops: OutboxOp[] = [];
  private loaded: Promise<void>;
  private flushing: Promise<void> | null = null;
  private again = false;
  /** A write landed during the current flush, so "all saved" has a new time. */
  private sentThisFlush = false;
  private status: OutboxStatus;
  /** What the listeners last heard, so a tick that changes nothing stays silent. */
  private published = "";

  constructor(opts: OutboxOptions) {
    this.store = opts.store;
    this.isOnline = opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.status = { ...summarize([]), online: this.isOnline(), syncing: false, lastSyncedAt: null, durable: this.store.durable };
    this.loaded = this.store.allOps().then(async (ops) => {
      const now = this.now();
      for (const op of ops.filter((o) => purgeable(o, now))) await this.store.deleteOp(op.opId);
      this.ops = ops.filter((o) => !purgeable(o, now));
      this.publish();
    });
  }

  /** Resolves once the stored ops are loaded. */
  ready(): Promise<void> {
    return this.loaded;
  }

  register(scope: string, executor: OutboxExecutor): () => void {
    this.executors.set(scope, executor);
    void this.flush();
    return () => {
      if (this.executors.get(scope) === executor) this.executors.delete(scope);
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  /** Called when an op is sent, refused or ends in conflict, so a screen can reconcile. */
  onSettled(fn: OpListener): () => void {
    this.settledListeners.add(fn);
    return () => this.settledListeners.delete(fn);
  }

  /** The sender's description of a write, or a neutral one when its screen is not open. */
  describe(op: OutboxOp): string {
    return this.executors.get(op.scope)?.describe?.(op) ?? (op.kind === "create" ? "New record" : "Change to a record");
  }

  getStatus(): OutboxStatus {
    return this.status;
  }

  /** Every op not yet confirmed by the server, in device order. */
  async unsent(scope?: string): Promise<OutboxOp[]> {
    await this.loaded;
    return this.ops.filter((o) => o.state !== "sent" && (!scope || o.scope === scope)).sort((a, b) => a.seq - b.seq);
  }

  /**
   * A list from the server when there is signal, saved as the device copy;
   * without signal, the last saved copy (null if this device never loaded
   * it). Rows come back as the server or copy had them; lay this device's
   * unsent writes on top with `overlay` (useOfflineList does both).
   */
  async readThrough<T extends Row>(
    key: string,
    fetchRows: () => Promise<T[]>
  ): Promise<{ rows: T[]; fromDevice: boolean; savedAt: string | null } | null> {
    await this.loaded;
    try {
      const rows = await fetchRows();
      const savedAt = this.now().toISOString();
      await this.store.putSnapshot(key, { rows, savedAt });
      return { rows, fromDevice: false, savedAt };
    } catch (err) {
      if (!looksOffline(err)) throw err;
      const snap = await this.store.getSnapshot<T>(key);
      return snap ? { rows: snap.rows, fromDevice: true, savedAt: snap.savedAt } : null;
    }
  }

  /** The last device copy saved under `key`, without asking the server. */
  async deviceCopy<T extends Row>(key: string): Promise<T[] | null> {
    await this.loaded;
    return (await this.store.getSnapshot<T>(key))?.rows ?? null;
  }

  /** Lays this device's unconfirmed writes on top of rows the caller already has. */
  overlay<T extends Row>(rows: readonly T[], model: string): T[] {
    return overlay(rows, this.ops, model);
  }

  /** Stores a write on the device, then tries to send. Resolves once it is stored, not sent. */
  async enqueue(input: EnqueueInput): Promise<OutboxOp> {
    await this.loaded;
    const recordId = String(input.input.id ?? "");
    if (!recordId) throw new Error("A queued write needs the record id");
    const op: OutboxOp = {
      opId: this.newId(),
      seq: await this.store.nextSeq(),
      scope: input.scope,
      model: input.model,
      kind: input.kind,
      recordId,
      input: input.input,
      base: input.base ?? null,
      baseUpdatedAt: input.baseUpdatedAt ?? null,
      state: "pending",
      createdAt: this.now().toISOString(),
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      sentAt: null,
      serverRow: null,
      conflictFields: [],
    };
    await this.store.putOp(op);
    this.ops.push(op);
    this.publish();
    void this.flush();
    return op;
  }

  /** Sends what can be sent now. Safe to call often; concurrent calls share one round. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.sentThisFlush = false;
    this.flushing = (async () => {
      await this.loaded;
      do {
        this.again = false;
        await this.round();
      } while (this.again);
    })().finally(() => {
      this.flushing = null;
      this.setSyncing(false);
    });
    return this.flushing;
  }

  /** Puts a refused or conflicting op back in line (after a person fixed the cause, or chose ours). */
  async retry(opId: string, opts: { keepOurs?: boolean } = {}): Promise<void> {
    await this.update(opId, (op) => ({
      ...op,
      state: "pending",
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      // Choosing ours after a conflict: send it over the server's current version.
      ...(opts.keepOurs && op.serverRow ? { base: null, baseUpdatedAt: null } : {}),
    }));
    void this.flush();
  }

  /** A person chose to drop a queued write. Never called by code on its own. */
  async discard(opId: string): Promise<void> {
    await this.loaded;
    await this.store.deleteOp(opId);
    this.ops = this.ops.filter((o) => o.opId !== opId);
    this.publish();
  }

  /** Everything on the device for this person and org, after sign out. */
  async clear(): Promise<void> {
    await this.store.clear();
    this.ops = [];
    this.publish();
  }

  /** The browser's online flag changed. */
  setOnline(online: boolean) {
    this.status = { ...this.status, online };
    this.publish();
    if (online) {
      // Signal is back: try everything now instead of waiting out the backoff.
      this.ops = this.ops.map((o) => (o.state === "pending" ? { ...o, nextAttemptAt: null } : o));
      void this.flush();
    }
  }

  private async round() {
    if (!this.isOnline()) return;
    const queue = sendable(this.ops, this.now());
    if (!queue.length) {
      // "All saved as of": stamped once, and again only after a flush that
      // sent something; the retry tick must not move it, or re-render
      // anything, when there was nothing to do.
      const settled = !this.ops.some((o) => o.state === "pending");
      if (settled && (this.status.lastSyncedAt === null || this.sentThisFlush)) {
        this.status = { ...this.status, lastSyncedAt: this.now().toISOString() };
      }
      this.publish();
      return;
    }
    this.setSyncing(true);
    const stopped = new Set<string>();
    for (const queued of queue) {
      // The op as it is now: an earlier send in this round may have moved
      // its base (rebaseAfter), and a person may have discarded it.
      const op = this.ops.find((o) => o.opId === queued.opId);
      if (!op || op.state !== "pending") continue;
      const key = `${op.model}#${op.recordId}`;
      if (stopped.has(key)) continue;
      const executor = this.executors.get(op.scope);
      // No screen has registered a sender for this scope yet; it waits.
      if (!executor) continue;
      let result: SendResult;
      try {
        result = await executor.send(op);
      } catch (err) {
        result = { kind: "offline", message: err instanceof Error ? err.message : String(err) };
      }
      const next = applyResult(op, result, this.now());
      // Screens take a confirmed write into their server copy before the
      // status update drops it from the overlay, so nothing flickers back.
      if (next.state !== "pending") this.settledListeners.forEach((fn) => fn(next));
      await this.replace(next);
      if (result.kind === "offline") return; // no signal: stop the round, keep the order
      if (next.state === "sent") {
        this.sentThisFlush = true;
        // This device's later edits to the same record were queued against
        // a row that did not yet show this one; move them forward so the
        // server's copy of our own change never reads as a conflict.
        const landed = result.kind === "ok" ? (result.row ?? null) : null;
        for (const moved of rebaseAfter(next, this.ops, landed)) await this.replace(moved);
      } else {
        stopped.add(key);
      }
    }
    this.again = this.again || sendable(this.ops, this.now()).some((o) => this.executors.has(o.scope));
  }

  private async update(opId: string, fn: (op: OutboxOp) => OutboxOp) {
    await this.loaded;
    const cur = this.ops.find((o) => o.opId === opId);
    if (cur) await this.replace(fn(cur));
  }

  private async replace(op: OutboxOp) {
    await this.store.putOp(op);
    this.ops = this.ops.map((o) => (o.opId === op.opId ? op : o));
    this.publish();
  }

  private setSyncing(syncing: boolean) {
    if (this.status.syncing === syncing) return;
    this.status = { ...this.status, syncing };
    this.publish();
  }

  private publish() {
    const next: OutboxStatus = { ...this.status, ...summarize(this.ops), online: this.isOnline() };
    // Listeners re-render the app; tell them only when something they can
    // see has changed (a retry tick with an empty queue changes nothing).
    const signature = [
      next.pending, next.conflicts, next.failed, next.online, next.syncing, next.lastSyncedAt, next.durable,
      ...next.unsent.map((o) => `${o.opId}:${o.state}:${o.attempts}:${o.lastError ?? ""}`),
    ].join("|");
    if (signature === this.published) {
      this.status = next;
      return;
    }
    this.published = signature;
    this.status = next;
    this.listeners.forEach((fn) => fn(this.status));
  }
}
