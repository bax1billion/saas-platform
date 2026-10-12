import type { OutboxOp, Snapshot } from "./types";

/**
 * Where the outbox and the last-known copies of lists live on the device.
 * The browser uses IndexedDB (idb-store.ts); tests and browsers without
 * IndexedDB use the memory store, which keeps working but does not survive
 * a reload. The mobile app plugs in its own adapter.
 */
export interface OfflineStore {
  /** True when the data survives a reload. */
  readonly durable: boolean;
  allOps(): Promise<OutboxOp[]>;
  putOp(op: OutboxOp): Promise<void>;
  deleteOp(opId: string): Promise<void>;
  /** The next seq to hand out; strictly increasing on this device. */
  nextSeq(): Promise<number>;
  getSnapshot<T>(key: string): Promise<Snapshot<T> | null>;
  putSnapshot<T>(key: string, snapshot: Snapshot<T>): Promise<void>;
  /** Removes everything this store holds (sign out). */
  clear(): Promise<void>;
}

export function memoryStore(): OfflineStore {
  const ops = new Map<string, OutboxOp>();
  const snapshots = new Map<string, Snapshot<unknown>>();
  let seq = 0;
  const copy = <T>(v: T): T => structuredClone(v);
  return {
    durable: false,
    async allOps() {
      return [...ops.values()].map(copy);
    },
    async putOp(op) {
      ops.set(op.opId, copy(op));
    },
    async deleteOp(opId) {
      ops.delete(opId);
    },
    async nextSeq() {
      seq += 1;
      return seq;
    },
    async getSnapshot<T>(key: string) {
      const s = snapshots.get(key);
      return s ? (copy(s) as Snapshot<T>) : null;
    },
    async putSnapshot(key, snapshot) {
      snapshots.set(key, copy(snapshot));
    },
    async clear() {
      ops.clear();
      snapshots.clear();
    },
  };
}
