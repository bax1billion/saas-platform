import type { OfflineStore } from "./store";
import type { OutboxOp, Snapshot } from "./types";

/**
 * IndexedDB storage for the outbox, one database per signed-in person and
 * organization so two people sharing a device never see each other's
 * queued work. Plain IndexedDB, no library: three object stores and a
 * handful of calls.
 */
const VERSION = 1;
const OPS = "ops";
const SNAPSHOTS = "snapshots";
const META = "meta";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function idbAvailable(factory: IDBFactory | undefined = globalThis.indexedDB): factory is IDBFactory {
  return !!factory;
}

export function offlineDbName(namespace: string): string {
  return `offline-outbox:${namespace}`;
}

export async function openIdbStore(namespace: string, factory: IDBFactory = globalThis.indexedDB): Promise<OfflineStore> {
  const open = factory.open(offlineDbName(namespace), VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(OPS)) db.createObjectStore(OPS, { keyPath: "opId" });
    if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS);
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  };
  const db = await req(open);

  return {
    durable: true,
    async allOps() {
      return req(db.transaction(OPS, "readonly").objectStore(OPS).getAll() as IDBRequest<OutboxOp[]>);
    },
    async putOp(op) {
      const tx = db.transaction(OPS, "readwrite");
      tx.objectStore(OPS).put(op);
      await done(tx);
    },
    async deleteOp(opId) {
      const tx = db.transaction(OPS, "readwrite");
      tx.objectStore(OPS).delete(opId);
      await done(tx);
    },
    async nextSeq() {
      // Read and bump in one transaction so two tabs never hand out the same number.
      const tx = db.transaction(META, "readwrite");
      const meta = tx.objectStore(META);
      const cur = ((await req(meta.get("seq"))) as number | undefined) ?? 0;
      meta.put(cur + 1, "seq");
      await done(tx);
      return cur + 1;
    },
    async getSnapshot<T>(key: string) {
      const s = await req(db.transaction(SNAPSHOTS, "readonly").objectStore(SNAPSHOTS).get(key));
      return (s as Snapshot<T> | undefined) ?? null;
    },
    async putSnapshot(key, snapshot) {
      const tx = db.transaction(SNAPSHOTS, "readwrite");
      tx.objectStore(SNAPSHOTS).put(snapshot, key);
      await done(tx);
    },
    async clear() {
      const tx = db.transaction([OPS, SNAPSHOTS, META], "readwrite");
      tx.objectStore(OPS).clear();
      tx.objectStore(SNAPSHOTS).clear();
      tx.objectStore(META).clear();
      await done(tx);
    },
  };
}
