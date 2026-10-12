import type { OutboxOp, OutboxSummary, Row, SendResult } from "./types";

/**
 * The outbox rules, pure. The runtime (outbox.ts) only stores ops and calls
 * these; every decision about order, retry, conflict and purge lives here.
 */

/** Days a sent op stays on the device before it is purged. */
export const KEEP_SENT_DAYS = 7;

const SECOND = 1000;
const MAX_DELAY_MS = 5 * 60 * SECOND;

/** Wait before the next try after `attempts` failures: 2 s doubling, at most 5 minutes. */
export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(MAX_DELAY_MS, 2 * SECOND * 2 ** (attempts - 1));
}

/**
 * The ops to send now, in device order. A record whose earlier write is
 * stuck (conflict or failed) holds back its later writes, so they are never
 * applied out of order; other records keep flowing. Ops waiting for their
 * retry time are skipped this round.
 */
export function sendable(ops: readonly OutboxOp[], now: Date): OutboxOp[] {
  const blocked = new Set<string>();
  const out: OutboxOp[] = [];
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    const key = `${op.model}#${op.recordId}`;
    if (op.state === "conflict" || op.state === "failed") {
      blocked.add(key);
      continue;
    }
    if (op.state !== "pending") continue;
    if (blocked.has(key)) continue;
    if (op.nextAttemptAt && Date.parse(op.nextAttemptAt) > now.getTime()) {
      // Later writes to the same record must not overtake this one.
      blocked.add(key);
      continue;
    }
    out.push(op);
  }
  return out;
}

/** The op after a send attempt. */
export function applyResult(op: OutboxOp, result: SendResult, now: Date): OutboxOp {
  const at = now.toISOString();
  switch (result.kind) {
    case "ok":
      return { ...op, state: "sent", sentAt: at, lastError: null, nextAttemptAt: null };
    case "offline": {
      const attempts = op.attempts + 1;
      return {
        ...op,
        attempts,
        lastError: result.message ?? "No signal",
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
      };
    }
    case "conflict":
      return { ...op, state: "conflict", serverRow: result.serverRow, conflictFields: result.fields, lastError: null };
    case "rejected":
      return { ...op, state: "failed", attempts: op.attempts + 1, lastError: result.message };
  }
}

/** A sent op older than `keepDays` leaves the device. Unsent ops never do. */
export function purgeable(op: OutboxOp, now: Date, keepDays = KEEP_SENT_DAYS): boolean {
  return op.state === "sent" && !!op.sentAt && now.getTime() - Date.parse(op.sentAt) > keepDays * 86_400_000;
}

/** Order-insensitive equality for stored values (JSON strings, arrays, objects, scalars). */
export function sameValue(a: unknown, b: unknown): boolean {
  return stableJson(a ?? null) === stableJson(b ?? null);
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * The conflict rule. An update conflicts when, since this device last saw
 * the row, someone else changed a field this update also changes, to a
 * different value. Changes to other fields merge (ours goes on top); the
 * same new value on both sides is no conflict. Nothing picks a winner: a
 * conflict keeps both versions for a person to decide.
 */
export function conflictFields(op: Pick<OutboxOp, "input" | "base" | "baseUpdatedAt">, server: Row): string[] {
  if (!op.base || !op.baseUpdatedAt) return [];
  if (server.updatedAt === op.baseUpdatedAt) return [];
  return Object.keys(op.input).filter(
    (f) => f !== "id" && f in op.base! && !sameValue(server[f], op.base![f]) && !sameValue(server[f], op.input[f])
  );
}

/**
 * After one of this device's writes lands, the later queued writes to the
 * same record were queued against a row that did not yet show it. Move
 * their base forward: a field the sent write changed now reads, in the
 * later write's base, as the value just sent (so the server's copy of our
 * own change is never mistaken for someone else's), and the base version
 * becomes the row the server returned, when it did. Only ops whose base
 * actually moved come back; the rest are untouched.
 */
export function rebaseAfter(sent: OutboxOp, later: readonly OutboxOp[], serverRow?: Row | null): OutboxOp[] {
  const out: OutboxOp[] = [];
  for (const op of later) {
    if (op.opId === sent.opId || op.state !== "pending" || op.seq <= sent.seq) continue;
    if (op.model !== sent.model || op.recordId !== sent.recordId || !op.base || !op.baseUpdatedAt) continue;
    const base = { ...op.base };
    let changed = false;
    for (const f of Object.keys(sent.input)) {
      if (f === "id" || !(f in base) || sameValue(base[f], sent.input[f])) continue;
      base[f] = sent.input[f];
      changed = true;
    }
    const updatedAt = typeof serverRow?.updatedAt === "string" ? serverRow.updatedAt : null;
    if (updatedAt && updatedAt !== op.baseUpdatedAt) {
      out.push({ ...op, base, baseUpdatedAt: updatedAt });
    } else if (changed) {
      out.push({ ...op, base });
    }
  }
  return out;
}

/**
 * Rows as this device should show them: the last server copy with every
 * write the server has not confirmed laid on top, in order. A create the
 * server already has is not added twice.
 */
export function overlay<T extends Row>(rows: readonly T[], ops: readonly OutboxOp[], model: string): T[] {
  const byId = new Map<string, T>(rows.map((r) => [r.id, r]));
  const order = rows.map((r) => r.id);
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    if (op.model !== model || op.state === "sent") continue;
    const cur = byId.get(op.recordId);
    if (op.kind === "create") {
      if (!cur) {
        byId.set(op.recordId, { ...(op.input as T) });
        order.push(op.recordId);
      }
    } else if (cur) {
      byId.set(op.recordId, { ...cur, ...(op.input as Partial<T>) });
    }
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

export function summarize(ops: readonly OutboxOp[]): OutboxSummary {
  const unsent = ops.filter((o) => o.state !== "sent").sort((a, b) => a.seq - b.seq);
  return {
    pending: unsent.filter((o) => o.state === "pending").length,
    conflicts: unsent.filter((o) => o.state === "conflict").length,
    failed: unsent.filter((o) => o.state === "failed").length,
    unsent,
  };
}

/** True when an error from the network layer means "no signal", not "the server said no". */
export function looksOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? String(err ?? "")}`;
  return /network ?error|failed to fetch|load failed|networkerror|timed? ?out|ECONNRESET|ENOTFOUND|fetch failed|offline/i.test(text);
}
