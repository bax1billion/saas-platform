# Offline: the device outbox

How work survives having no signal. Code: `lib/offline/`. The design: a
local store per device, a sync queue with a version per record, a conflict
rule, a sync pill, retry until posted, the local copy removed N days after
a confirmed post; built as a small outbox in IndexedDB plus optimistic
screens, not a heavy sync engine. Amplify Gen 2 has no DataStore, so the
outbox is ours.

## The rule

A write is never sent straight to the server. It is saved on the device,
shown on screen at once, and sent in order when there is signal. It is
retried until the server takes it and never dropped. A write the server
refuses, or one that collides with someone else's change, stays on screen
and in the sync pill until a person decides.

## Pieces

| File | What it does |
|---|---|
| `types.ts` | The queued write (`OutboxOp`) and the four states: pending, sent, conflict, failed |
| `queue.ts` | The pure rules: send order, retry backoff (2 s doubling to 5 minutes), purge (sent writes leave the device after 7 days), the conflict rule, laying unsent writes over a list |
| `store.ts`, `idb-store.ts` | Storage: IndexedDB in the browser, one database per signed-in person and organization; memory where IndexedDB is refused (the pill says work will not survive a reload) |
| `outbox.ts` | The runtime: enqueue, single-flight send rounds, read-through lists, retry and discard |
| `amplify.ts` | Turns one Amplify model's create, update and get into a sender |
| `react.tsx` | `OutboxProvider` (mounted once in `app/(app)/layout.tsx`), `useOutboxStatus`, `useOfflineList` |
| `app/components/SyncPill.tsx` | The sync pill and the list of unsent work, with Try again, Keep mine, Keep theirs and Discard |
| `config/offline.ts` | Which modules save through the outbox, and each one's sender |

## Rules a module follows

- **Mint the id on the device** for every create, so a replay after a
  dropped connection can never add the record twice. A replayed create
  the server already has counts as sent.
- **Queue an update with the row as the device saw it.** The changed
  fields' values and the row's `updatedAt` are the record's version. When
  the outbox sends it, it reads the server's row first: if someone else
  changed one of the same fields to a different value, the write ends in
  conflict with both versions kept. Changes to other fields merge.
  Nothing in code picks a winner.
- **Writes to one record go in order.** A stuck write holds back later
  writes to the same record; other records keep flowing. When one lands,
  the later writes to that record are rebased on it (their base moves to
  the value just sent and their version to the row the server returned),
  so two edits made without signal never read the first as someone
  else's change; a colleague's write in between still conflicts.
- **Read lists through the outbox** (`useOfflineList`): the server's rows
  when connected, saved as the device copy; the copy when not; unsent
  writes on top, so a screen shows its own queued edits even after a
  reload. A per-parent list passes `filter`.
- **Command mutations** (`a.handler.function`) are not queued here: they
  exist to refuse a request before anything is written, which needs the
  server. A module that wants one offline needs its own design.

## Not covered yet

- **Opening or reloading the app with no signal** needs the installable
  app shell and its service worker (a separate platform item). Today the
  outbox covers losing signal while the app is open, and reloading once
  signal is back.
- **Map tiles** (a product with a map) are not cached on purpose; only
  areas already viewed in the browser's own cache may show.
- **Sign out** does not yet warn about unsent work or clear the device
  store. The store is per person and organization, so another person on
  the same device never sees it.
- **Encryption at rest** of the device store.
- **Purge of sent writes runs when the outbox opens**, not during a
  long-lived tab; a tab left open for days keeps its sent writes until
  the next open.
- **A scope with no registered sender** waits silently as pending (every
  scope is registered at app start today; a module that adds a scope to
  the outbox without adding its sender to `config/offline.ts` queues work
  that never sends).
- **The full conflict card** with a supervisor decision (a separate
  platform item). The pill's Keep mine and Keep theirs is the minimum.
- **Creates on an owner-ruled model.** "Mint the id on the device" cannot
  hold for a model whose column carries a field-level rule: its create
  resolver refuses an undeclared `id` (CLAUDE.md Gotchas), so the server
  mints one. Before such a module registers a sender, the outbox needs a
  create that keeps the device id as its replay key, sends the row
  without it, and re-keys the device copy and the queued updates with the
  id the server returns.

Nothing here has run against a sandbox or on a real iPad yet.
