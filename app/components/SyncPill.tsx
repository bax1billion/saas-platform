"use client";

import { useState } from "react";
import { CloudOff, CloudUpload, Check, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOutbox, useOutboxStatus } from "@/lib/offline/react";
import type { OutboxOp } from "@/lib/offline/types";

/**
 * The sync pill: whether this device's work has reached the server. Never
 * silent about unsent work. Tapping it lists every write not yet confirmed;
 * a refused write or a conflict waits there for a person to decide.
 */
export default function SyncPill() {
  const outbox = useOutbox();
  const s = useOutboxStatus();
  const [open, setOpen] = useState(false);
  if (!outbox) return null;

  const attention = s.conflicts + s.failed;
  // `short` is what a phone shows, so the module header stays one line at
  // 390 wide; the full words are always in the aria-label and the sheet.
  const { label, short, tone, Icon } = attention
    ? { label: `${attention} need${attention === 1 ? "s" : ""} a look`, short: `${attention} to check`, tone: "crit", Icon: TriangleAlert }
    : s.pending && !s.online
      ? { label: `${s.pending} saved on this device`, short: `${s.pending} on device`, tone: "warn", Icon: CloudOff }
      : s.pending
        ? { label: `Syncing ${s.pending}`, short: `Syncing ${s.pending}`, tone: "warn", Icon: CloudUpload }
        : !s.online
          ? { label: "Offline, all saved", short: "Offline", tone: "warn", Icon: CloudOff }
          : { label: "All saved", short: "All saved", tone: "ok", Icon: Check };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Sync status: ${label}`}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold",
          tone === "ok" && "border-border text-muted-foreground",
          tone === "warn" && "border-transparent bg-warning text-warning-foreground",
          tone === "crit" && "border-transparent bg-destructive text-destructive-foreground"
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="sm:hidden" aria-hidden>
          {short}
        </span>
        <span className="hidden sm:inline" aria-hidden>
          {label}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>Sync</DialogTitle>
          <DialogDescription>
            {s.online ? "Connected." : "No signal."} Work is saved on this device first and sent in order when there is signal.
            {!s.durable && " This browser cannot keep it across a reload, so stay on this page until it syncs."}
          </DialogDescription>
          {s.unsent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everything is on the server{s.lastSyncedAt ? ` as of ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : ""}.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {s.unsent.map((op) => (
                <OpRow key={op.opId} op={op} describe={outbox.describe(op)} onRetry={(keepOurs) => outbox.retry(op.opId, { keepOurs })} onDiscard={() => outbox.discard(op.opId)} />
              ))}
            </ul>
          )}
          {s.pending > 0 && s.online && (
            <Button variant="outline" onClick={() => void outbox.flush()}>
              Send now
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OpRow({
  op,
  describe,
  onRetry,
  onDiscard,
}: {
  op: OutboxOp;
  describe: string;
  onRetry: (keepOurs: boolean) => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <li className="py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{describe}</div>
          <div className="text-xs text-muted-foreground">Saved on this device {new Date(op.createdAt).toLocaleString()}</div>
        </div>
        <span className="shrink-0 text-xs font-semibold">
          {op.state === "pending" ? "Waiting" : op.state === "conflict" ? "Conflict" : "Refused"}
        </span>
      </div>
      {op.state === "failed" && <p className="mt-1 text-destructive">{op.lastError}</p>}
      {op.state === "conflict" && (
        <div className="mt-2 rounded-md border border-border p-2">
          <p className="text-xs text-muted-foreground">Someone else changed this first. Both versions are kept until you choose.</p>
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2">Field</th>
                <th className="py-1 pr-2">Yours</th>
                <th className="py-1">On the server</th>
              </tr>
            </thead>
            <tbody>
              {op.conflictFields.map((f) => (
                <tr key={f}>
                  <td className="py-1 pr-2 font-medium">{f}</td>
                  <td className="py-1 pr-2 break-all">{show(op.input[f])}</td>
                  <td className="py-1 break-all">{show(op.serverRow?.[f])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {op.state !== "pending" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onRetry(op.state === "conflict")}>
            {op.state === "conflict" ? "Keep mine" : "Try again"}
          </Button>
          {confirmDiscard ? (
            <Button size="sm" variant="destructive" onClick={onDiscard}>
              {op.state === "conflict" ? "Yes, keep theirs" : "Yes, discard my change"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(true)}>
              {op.state === "conflict" ? "Keep theirs" : "Discard"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  return typeof v === "string" ? v : JSON.stringify(v);
}
