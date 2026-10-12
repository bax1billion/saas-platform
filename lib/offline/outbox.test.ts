import { describe, expect, it } from "vitest";
import { classifyErrors, sendWithAmplify, type ModelCalls } from "./amplify";
import { Outbox } from "./outbox";
import { memoryStore } from "./store";
import type { OutboxExecutor, OutboxOp, Row, SendResult } from "./types";

/** A fake server: a table of rows and a switch for the signal. */
function fakeServer() {
  const rows = new Map<string, Row>();
  let online = true;
  let clock = 0;
  const sent: string[] = [];
  const executor: OutboxExecutor = {
    async send(op: OutboxOp): Promise<SendResult> {
      if (!online) return { kind: "offline" };
      sent.push(`${op.kind}:${op.recordId}`);
      clock += 1;
      if (op.kind === "create") {
        if (rows.has(op.recordId)) return { kind: "ok" };
        rows.set(op.recordId, { ...op.input, updatedAt: `t${clock}` });
      } else {
        const cur = rows.get(op.recordId);
        if (!cur) return { kind: "rejected", message: "gone" };
        rows.set(op.recordId, { ...cur, ...op.input, updatedAt: `t${clock}` });
      }
      return { kind: "ok" };
    },
  };
  return {
    rows,
    sent,
    executor,
    setOnline: (v: boolean) => {
      online = v;
    },
    isOnline: () => online,
  };
}

let n = 0;
const newId = () => `op${++n}`;

describe("Outbox", () => {
  it("keeps every write through no signal and sends them in order when it returns", async () => {
    const server = fakeServer();
    const outbox = new Outbox({ store: memoryStore(), isOnline: server.isOnline, newId });
    outbox.register("s", server.executor);
    server.setOnline(false);

    await outbox.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "a", label: "first" } });
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "second" } });
    await outbox.flush();
    expect(outbox.getStatus().pending).toBe(2);
    expect(server.rows.size).toBe(0);

    server.setOnline(true);
    outbox.setOnline(true);
    await outbox.flush();
    expect(server.sent).toEqual(["create:a", "update:a"]);
    expect(server.rows.get("a")?.label).toBe("second");
    expect(outbox.getStatus()).toMatchObject({ pending: 0, conflicts: 0, failed: 0 });
  });

  it("survives a reload: a new outbox on the same store picks the queue back up", async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.setOnline(false);
    const first = new Outbox({ store, isOnline: server.isOnline, newId });
    first.register("s", server.executor);
    await first.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "b" } });
    await first.flush();

    server.setOnline(true);
    const second = new Outbox({ store, isOnline: server.isOnline, newId });
    await second.ready();
    expect(second.getStatus().pending).toBe(1);
    second.register("s", server.executor);
    await second.flush();
    expect(server.rows.has("b")).toBe(true);
  });

  it("waits for a scope's sender instead of dropping its writes", async () => {
    const server = fakeServer();
    const outbox = new Outbox({ store: memoryStore(), isOnline: server.isOnline, newId });
    await outbox.enqueue({ scope: "later", model: "M", kind: "create", input: { id: "c" } });
    await outbox.flush();
    expect(outbox.getStatus().pending).toBe(1);
    outbox.register("later", server.executor);
    await outbox.flush();
    expect(outbox.getStatus().pending).toBe(0);
  });

  it("a refused write stays until a person retries or discards it, and holds back that record", async () => {
    const server = fakeServer();
    const outbox = new Outbox({ store: memoryStore(), isOnline: server.isOnline, newId });
    outbox.register("s", server.executor);
    const bad = await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "nope", label: "x" } });
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "nope", label: "y" } });
    await outbox.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "fine" } });
    await outbox.flush();
    expect(outbox.getStatus()).toMatchObject({ failed: 1, pending: 1 });
    expect(server.sent).toEqual(["update:nope", "create:fine"]);

    await outbox.discard(bad.opId);
    expect(outbox.getStatus().failed).toBe(0);
  });

  it("reads through: server rows when there is signal, the device copy when not, with queued writes on top", async () => {
    const server = fakeServer();
    const outbox = new Outbox({ store: memoryStore(), isOnline: server.isOnline, newId });
    const first = await outbox.readThrough("list", async () => [{ id: "a", label: "A" }]);
    expect(first).toMatchObject({ fromDevice: false, rows: [{ id: "a", label: "A" }] });

    server.setOnline(false);
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "A2" } });
    await outbox.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "b", label: "B" } });
    const offline = await outbox.readThrough("list", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(offline).toMatchObject({ fromDevice: true, rows: [{ id: "a", label: "A" }] });
    expect(outbox.overlay(offline!.rows, "M")).toEqual([{ id: "a", label: "A2" }, { id: "b", label: "B" }]);
    expect(await outbox.deviceCopy("list")).toEqual([{ id: "a", label: "A" }]);

    const never = await outbox.readThrough("other", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(never).toBeNull();
    await expect(
      outbox.readThrough("list", async () => {
        throw new Error("Not Authorized");
      })
    ).rejects.toThrow("Not Authorized");
  });
});

/**
 * A server with Amplify's shape: a table of rows whose updatedAt moves on
 * every write, reached through `sendWithAmplify`, so the conflict check
 * runs exactly as it will against the real client.
 */
function amplifyServer() {
  const rows = new Map<string, Row>();
  let clock = 0;
  const calls: ModelCalls = {
    async create(input) {
      if (rows.has(input.id)) return { errors: [{ errorType: "DynamoDB:ConditionalCheckFailedException", message: "The conditional request failed" }] };
      clock += 1;
      const row = { ...input, updatedAt: `t${clock}` };
      rows.set(input.id, row);
      return { data: row };
    },
    async update(input) {
      const cur = rows.get(input.id);
      if (!cur) return { errors: [{ message: "Not found" }] };
      clock += 1;
      const row = { ...cur, ...input, updatedAt: `t${clock}` };
      rows.set(input.id, row);
      return { data: row };
    },
    async get(id) {
      return { data: rows.get(id) ?? null };
    },
  };
  const executor: OutboxExecutor = { send: (op) => sendWithAmplify(op, calls) };
  return { rows, executor, bump: (id: string, patch: Record<string, unknown>) => calls.update({ ...patch, id }) };
}

describe("Outbox, a record's own history", () => {
  it("two edits to the same row queued with no signal both land: the second is not mistaken for someone else's conflict", async () => {
    const server = amplifyServer();
    await server.rows.set("a", { id: "a", label: "Old", notes: "", updatedAt: "t0" });
    let online = false;
    const outbox = new Outbox({ store: memoryStore(), isOnline: () => online, newId });
    outbox.register("s", server.executor);
    // Both edits were made against the row as the device last had it from the server (t0).
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "First" }, base: { label: "Old" }, baseUpdatedAt: "t0" });
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "Second" }, base: { label: "Old" }, baseUpdatedAt: "t0" });
    online = true;
    outbox.setOnline(true);
    await outbox.flush();
    expect(outbox.getStatus()).toMatchObject({ pending: 0, conflicts: 0, failed: 0 });
    expect(server.rows.get("a")?.label).toBe("Second");
  });

  it("a colleague's change between the two still ends the second in conflict, with both versions", async () => {
    const server = amplifyServer();
    server.rows.set("a", { id: "a", label: "Old", updatedAt: "t0" });
    let online = false;
    const outbox = new Outbox({ store: memoryStore(), isOnline: () => online, newId });
    const sends: string[] = [];
    outbox.register("s", {
      async send(op) {
        sends.push(op.input.label as string);
        const r = await server.executor.send(op);
        // Right after our first write lands, someone else changes the same field.
        if (op.input.label === "First") await server.bump("a", { label: "Theirs" });
        return r;
      },
    });
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "First" }, base: { label: "Old" }, baseUpdatedAt: "t0" });
    await outbox.enqueue({ scope: "s", model: "M", kind: "update", input: { id: "a", label: "Second" }, base: { label: "Old" }, baseUpdatedAt: "t0" });
    online = true;
    outbox.setOnline(true);
    await outbox.flush();
    const [conflict] = outbox.getStatus().unsent;
    expect(outbox.getStatus()).toMatchObject({ pending: 0, conflicts: 1 });
    expect(conflict).toMatchObject({ conflictFields: ["label"], serverRow: { label: "Theirs" }, input: { label: "Second" } });
    expect(server.rows.get("a")?.label).toBe("Theirs");
  });

  it("a replayed create the server already holds counts as sent", async () => {
    const server = amplifyServer();
    server.rows.set("born", { id: "born", label: "x", updatedAt: "t0" });
    const outbox = new Outbox({ store: memoryStore(), isOnline: () => true, newId });
    outbox.register("s", server.executor);
    await outbox.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "born", label: "x" } });
    await outbox.flush();
    expect(outbox.getStatus()).toMatchObject({ pending: 0, failed: 0 });
  });

  it("a retry tick with nothing to send tells the listeners nothing", async () => {
    const server = fakeServer();
    const outbox = new Outbox({ store: memoryStore(), isOnline: server.isOnline, newId });
    outbox.register("s", server.executor);
    await outbox.enqueue({ scope: "s", model: "M", kind: "create", input: { id: "q" } });
    await outbox.flush();
    let heard = 0;
    const off = outbox.subscribe(() => {
      heard += 1;
    });
    expect(heard).toBe(1); // the current status, once, on subscribe
    await outbox.flush();
    await outbox.flush();
    expect(heard).toBe(1);
    expect(outbox.getStatus().lastSyncedAt).not.toBeNull();
    off();
  });
});

describe("sendWithAmplify", () => {
  function calls(server: Row | null, opts: { createErrors?: { errorType?: string; message?: string }[]; throwOffline?: boolean } = {}) {
    const log: string[] = [];
    const c: ModelCalls = {
      async create(input) {
        if (opts.throwOffline) throw new TypeError("Failed to fetch");
        log.push(`create ${input.id}`);
        return { data: input, errors: opts.createErrors };
      },
      async update(input) {
        log.push(`update ${input.id}`);
        return { data: input };
      },
      async get() {
        return { data: server };
      },
    };
    return { c, log };
  }
  const baseOp: OutboxOp = {
    opId: "o",
    seq: 1,
    scope: "s",
    model: "M",
    kind: "update",
    recordId: "a",
    input: { id: "a", label: "Mine" },
    base: { label: "Old" },
    baseUpdatedAt: "t1",
    state: "pending",
    createdAt: "",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    serverRow: null,
    conflictFields: [],
  };

  it("checks for a conflict before an update and never writes over the other change", async () => {
    const { c, log } = calls({ id: "a", label: "Theirs", updatedAt: "t2" });
    expect(await sendWithAmplify(baseOp, c)).toMatchObject({ kind: "conflict", fields: ["label"] });
    expect(log).toEqual([]);
  });

  it("sends the update when only other fields moved", async () => {
    const { c, log } = calls({ id: "a", label: "Old", notes: "new", updatedAt: "t2" });
    expect(await sendWithAmplify(baseOp, c)).toMatchObject({ kind: "ok" });
    expect(log).toEqual(["update a"]);
  });

  it("a replayed create that already landed counts as sent", async () => {
    const { c } = calls(null, { createErrors: [{ errorType: "DynamoDB:ConditionalCheckFailedException", message: "The conditional request failed" }] });
    expect(await sendWithAmplify({ ...baseOp, kind: "create", base: null }, c)).toEqual({ kind: "ok" });
  });

  it("no signal is offline, a refusal is rejected, a missing row is rejected", async () => {
    expect((await sendWithAmplify({ ...baseOp, kind: "create" }, calls(null, { throwOffline: true }).c)).kind).toBe("offline");
    expect(classifyErrors([{ errorType: "Unauthorized", message: "Not Authorized to access createX" }], "create")).toMatchObject({ kind: "rejected" });
    expect(classifyErrors([{ message: "Network error" }], "update")).toMatchObject({ kind: "offline" });
    expect((await sendWithAmplify(baseOp, calls(null).c)).kind).toBe("rejected");
  });
});
