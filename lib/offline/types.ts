/**
 * Offline outbox types. Pure data, no DOM: the planned mobile app reuses
 * this folder with its own storage adapter.
 *
 * A write is never sent straight to the server. It is written to the
 * device first (the outbox), shown on screen at once, and sent in order
 * when there is signal. It is retried until the server takes it, and it is
 * never dropped: a write the server refuses stays visible until a person
 * retries or discards it.
 */

export type OpKind = "create" | "update";

/**
 * pending  waiting to be sent (or to be retried after no signal)
 * sent     the server took it; kept a few days, then purged
 * conflict someone else changed the same fields first; both versions kept
 * failed   the server refused it (rules, validation, permissions)
 */
export type OpState = "pending" | "sent" | "conflict" | "failed";

export type Row = Record<string, unknown> & { id: string };

export interface OutboxOp {
  /** Unique id of this queued write. */
  opId: string;
  /** Monotonic order on this device. Writes are sent in this order. */
  seq: number;
  /** Which executor sends it, e.g. a module id. */
  scope: string;
  /** Model name, e.g. the table the write targets. */
  model: string;
  kind: OpKind;
  /** The record's id. Creates carry an id minted on the device, so a replay can never duplicate. */
  recordId: string;
  /** The create input, or the changed fields of an update (with `id`). */
  input: Row;
  /**
   * For an update: the values of the changed fields as this device last
   * saw them, and that row's `updatedAt`. Used to detect a conflict.
   * Null for a create, or an update of a row created on this device.
   */
  base: Record<string, unknown> | null;
  baseUpdatedAt: string | null;
  state: OpState;
  createdAt: string;
  attempts: number;
  /** Earliest time the next attempt may run (ISO). */
  nextAttemptAt: string | null;
  lastError: string | null;
  sentAt: string | null;
  /** The server's row when this op ended in conflict, kept next to ours. */
  serverRow: Row | null;
  /** Fields both sides changed, for the conflict card. */
  conflictFields: string[];
}

/** What an executor reports after trying to send one op. */
export type SendResult =
  | { kind: "ok"; row?: Row }
  /** No signal, a timeout, or a session that cannot refresh without signal. Retry later. */
  | { kind: "offline"; message?: string }
  | { kind: "conflict"; serverRow: Row; fields: string[] }
  | { kind: "rejected"; message: string };

/** Sends one op to the server. One executor per scope. */
export interface OutboxExecutor {
  send(op: OutboxOp): Promise<SendResult>;
  /** A plain description of the write for the sync list, e.g. "Moved a map pin". */
  describe?(op: OutboxOp): string;
}

export interface OutboxSummary {
  pending: number;
  conflicts: number;
  failed: number;
  /** Ops that are not yet confirmed by the server, by state. */
  unsent: OutboxOp[];
}

export interface Snapshot<T = Row> {
  rows: T[];
  savedAt: string;
}
