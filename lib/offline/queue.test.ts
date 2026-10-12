import { describe, expect, it } from "vitest";
import { applyResult, conflictFields, looksOffline, overlay, purgeable, rebaseAfter, retryDelayMs, sameValue, sendable, summarize } from "./queue";
import type { OutboxOp } from "./types";

const NOW = new Date("2026-10-02T12:00:00Z");

function op(p: Partial<OutboxOp> & Pick<OutboxOp, "seq" | "recordId">): OutboxOp {
  return {
    opId: `op-${p.seq}`,
    scope: "s",
    model: "M",
    kind: "update",
    input: { id: p.recordId },
    base: null,
    baseUpdatedAt: null,
    state: "pending",
    createdAt: NOW.toISOString(),
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    serverRow: null,
    conflictFields: [],
    ...p,
  };
}

describe("sendable", () => {
  it("sends in device order", () => {
    const out = sendable([op({ seq: 3, recordId: "a" }), op({ seq: 1, recordId: "b" }), op({ seq: 2, recordId: "a" })], NOW);
    expect(out.map((o) => o.seq)).toEqual([1, 2, 3]);
  });

  it("a stuck write holds back later writes to the same record only", () => {
    const out = sendable(
      [op({ seq: 1, recordId: "a", state: "failed" }), op({ seq: 2, recordId: "a" }), op({ seq: 3, recordId: "b" })],
      NOW
    );
    expect(out.map((o) => o.seq)).toEqual([3]);
  });

  it("waits out a retry time and keeps that record's order", () => {
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    const out = sendable([op({ seq: 1, recordId: "a", nextAttemptAt: later }), op({ seq: 2, recordId: "a" }), op({ seq: 3, recordId: "b" })], NOW);
    expect(out.map((o) => o.seq)).toEqual([3]);
  });

  it("skips sent writes", () => {
    expect(sendable([op({ seq: 1, recordId: "a", state: "sent" })], NOW)).toEqual([]);
  });
});

describe("applyResult", () => {
  it("sent", () => {
    expect(applyResult(op({ seq: 1, recordId: "a" }), { kind: "ok" }, NOW)).toMatchObject({ state: "sent", sentAt: NOW.toISOString() });
  });

  it("no signal stays pending with a backoff", () => {
    const next = applyResult(op({ seq: 1, recordId: "a", attempts: 2 }), { kind: "offline" }, NOW);
    expect(next).toMatchObject({ state: "pending", attempts: 3, lastError: "No signal" });
    expect(Date.parse(next.nextAttemptAt!) - NOW.getTime()).toBe(retryDelayMs(3));
  });

  it("refused and conflict keep the write for a person", () => {
    expect(applyResult(op({ seq: 1, recordId: "a" }), { kind: "rejected", message: "Not authorized" }, NOW)).toMatchObject({
      state: "failed",
      lastError: "Not authorized",
    });
    expect(applyResult(op({ seq: 1, recordId: "a" }), { kind: "conflict", serverRow: { id: "a", x: 2 }, fields: ["x"] }, NOW)).toMatchObject({
      state: "conflict",
      serverRow: { id: "a", x: 2 },
      conflictFields: ["x"],
    });
  });
});

describe("retry and purge", () => {
  it("backs off from 2 s to at most 5 minutes", () => {
    expect([0, 1, 2, 3].map(retryDelayMs)).toEqual([0, 2000, 4000, 8000]);
    expect(retryDelayMs(30)).toBe(300_000);
  });

  it("only sent writes older than the keep window leave the device", () => {
    const old = new Date(NOW.getTime() - 8 * 86_400_000).toISOString();
    expect(purgeable(op({ seq: 1, recordId: "a", state: "sent", sentAt: old }), NOW)).toBe(true);
    expect(purgeable(op({ seq: 1, recordId: "a", state: "sent", sentAt: NOW.toISOString() }), NOW)).toBe(false);
    expect(purgeable(op({ seq: 1, recordId: "a", state: "failed", sentAt: old }), NOW)).toBe(false);
  });
});

describe("conflict rule", () => {
  const base = { input: { id: "a", label: "Mine", lat: 2 }, base: { label: "Old", lat: 1 }, baseUpdatedAt: "t1" };

  it("no conflict when the server row has not moved", () => {
    expect(conflictFields(base, { id: "a", label: "Old", lat: 1, updatedAt: "t1" })).toEqual([]);
  });

  it("someone else changed a field I also changed, to something else", () => {
    expect(conflictFields(base, { id: "a", label: "Theirs", lat: 1, updatedAt: "t2" })).toEqual(["label"]);
  });

  it("their change to another field merges; the same new value is no conflict", () => {
    expect(conflictFields(base, { id: "a", label: "Old", lat: 1, notes: "x", updatedAt: "t2" })).toEqual([]);
    expect(conflictFields(base, { id: "a", label: "Mine", lat: 1, updatedAt: "t2" })).toEqual([]);
  });

  it("a row created on this device has no base and never conflicts", () => {
    expect(conflictFields({ ...base, base: null, baseUpdatedAt: null }, { id: "a", label: "Theirs", updatedAt: "t2" })).toEqual([]);
  });

  it("compares JSON values regardless of key order", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
  });

  it("a server-owned column a stream handler wrote is never a conflict: only fields this write changes are compared", () => {
    // The scorer wrote status and riskTier and moved updatedAt; the device changed label only.
    const mine = { input: { id: "a", label: "Mine" }, base: { label: "Old" }, baseUpdatedAt: "t1" };
    expect(conflictFields(mine, { id: "a", label: "Old", status: "VERIFIED", riskTier: "HIGH", updatedAt: "t2" })).toEqual([]);
  });

  it("a field the device cleared and the server filled is a conflict; the same clearing on both sides is not", () => {
    const mine = { input: { id: "a", notes: null }, base: { notes: "draft" }, baseUpdatedAt: "t1" };
    expect(conflictFields(mine, { id: "a", notes: "final", updatedAt: "t2" })).toEqual(["notes"]);
    expect(conflictFields(mine, { id: "a", notes: null, updatedAt: "t2" })).toEqual([]);
  });
});

describe("rebaseAfter", () => {
  const sent = op({ seq: 1, recordId: "a", input: { id: "a", label: "First", lat: 2 }, base: { label: "Old", lat: 1 }, baseUpdatedAt: "t1", state: "sent" });

  it("moves a later write's base to the value just sent, and its version to the row the server returned", () => {
    const later = op({ seq: 2, recordId: "a", input: { id: "a", label: "Second" }, base: { label: "Old" }, baseUpdatedAt: "t1" });
    const [moved] = rebaseAfter(sent, [later], { id: "a", label: "First", lat: 2, updatedAt: "t2" });
    expect(moved).toMatchObject({ opId: later.opId, base: { label: "First" }, baseUpdatedAt: "t2" });
    // With the base moved, the server's copy of our own first write is no conflict.
    expect(conflictFields(moved, { id: "a", label: "First", lat: 2, updatedAt: "t2" })).toEqual([]);
  });

  it("moves the base even when the sender returned no row, so the field compare still passes", () => {
    const later = op({ seq: 2, recordId: "a", input: { id: "a", label: "Second" }, base: { label: "Old" }, baseUpdatedAt: "t1" });
    const [moved] = rebaseAfter(sent, [later], null);
    expect(moved).toMatchObject({ base: { label: "First" }, baseUpdatedAt: "t1" });
    expect(conflictFields(moved, { id: "a", label: "First", updatedAt: "t2" })).toEqual([]);
  });

  it("leaves other records, earlier writes, settled writes and rows born on this device alone", () => {
    const other = op({ seq: 2, recordId: "b", input: { id: "b", label: "x" }, base: { label: "y" }, baseUpdatedAt: "t1" });
    const earlier = op({ seq: 0, recordId: "a", input: { id: "a", label: "x" }, base: { label: "y" }, baseUpdatedAt: "t1" });
    const failed = op({ seq: 3, recordId: "a", input: { id: "a", label: "x" }, base: { label: "y" }, baseUpdatedAt: "t1", state: "failed" });
    const born = op({ seq: 4, recordId: "a", input: { id: "a", label: "x" } });
    const untouched = op({ seq: 5, recordId: "a", input: { id: "a", notes: "n" }, base: { notes: "m" }, baseUpdatedAt: "t1" });
    expect(rebaseAfter(sent, [other, earlier, failed, born, untouched], null)).toEqual([]);
  });
});

describe("overlay, a record's own history", () => {
  it("a create and then an update of the same row on this device show as one row with the update applied", () => {
    const ops = [
      op({ seq: 1, recordId: "n", kind: "create", input: { id: "n", label: "New", lat: 1 } }),
      op({ seq: 2, recordId: "n", input: { id: "n", label: "Renamed" } }),
    ];
    expect(overlay([], ops, "M")).toEqual([{ id: "n", label: "Renamed", lat: 1 }]);
  });

  it("a row the server updated meanwhile keeps the server's other fields under this device's unsent change", () => {
    const rows = [{ id: "a", label: "A", status: "VERIFIED", riskTier: "HIGH" }];
    const ops = [op({ seq: 1, recordId: "a", input: { id: "a", label: "A2" } })];
    expect(overlay(rows, ops, "M")).toEqual([{ id: "a", label: "A2", status: "VERIFIED", riskTier: "HIGH" }]);
  });
});

describe("overlay", () => {
  it("lays unconfirmed writes over the server copy in order, without duplicating a create", () => {
    const rows = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
    const ops = [
      op({ seq: 1, recordId: "c", kind: "create", input: { id: "c", label: "C" } }),
      op({ seq: 2, recordId: "a", input: { id: "a", label: "A2" } }),
      op({ seq: 3, recordId: "a", input: { id: "a", label: "A3" }, state: "failed" }),
      op({ seq: 4, recordId: "b", kind: "create", input: { id: "b", label: "dup" } }),
      op({ seq: 5, recordId: "b", input: { id: "b", label: "sent" }, state: "sent" }),
      op({ seq: 6, recordId: "z", model: "Other", input: { id: "z" } }),
    ];
    expect(overlay(rows, ops, "M")).toEqual([{ id: "a", label: "A3" }, { id: "b", label: "B" }, { id: "c", label: "C" }]);
  });
});

describe("summarize and looksOffline", () => {
  it("counts what is not on the server", () => {
    const s = summarize([op({ seq: 2, recordId: "a" }), op({ seq: 1, recordId: "b", state: "conflict" }), op({ seq: 3, recordId: "c", state: "sent" })]);
    expect(s).toMatchObject({ pending: 1, conflicts: 1, failed: 0 });
    expect(s.unsent.map((o) => o.seq)).toEqual([1, 2]);
  });

  it("tells no signal from a refusal", () => {
    expect(looksOffline(new TypeError("Failed to fetch"))).toBe(true);
    expect(looksOffline({ name: "NetworkError", message: "x" })).toBe(true);
    expect(looksOffline(new Error("Not Authorized to access update on type X"))).toBe(false);
  });
});
