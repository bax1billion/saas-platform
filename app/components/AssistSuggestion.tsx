"use client";

import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A suggestion from Assist, shown light until the person decides
 * (the founder's rule: suggested shows light, confirmed shows bold; a
 * person confirms). The product passes the text, decides what "accept"
 * writes, and gets the edited text back; this piece only presents the
 * three choices and never writes anything itself.
 */
export default function AssistSuggestion({
  text,
  detail,
  cached,
  busy,
  onAccept,
  onEdit,
  onReject,
}: {
  text: string;
  /** Optional supporting lines under the suggestion. */
  detail?: ReactNode;
  cached?: boolean;
  busy?: boolean;
  onAccept: () => void;
  /** Called with the person's edited text. */
  onEdit: (text: string) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  return (
    <div className={cn("rounded-lg border border-dashed border-info/50 bg-info/5 p-3 text-sm", busy && "opacity-60")} aria-live="polite">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Assist suggestion{cached ? " (same as before)" : ""}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          aria-label="Edit the suggestion"
        />
      ) : (
        <p className="italic text-foreground/80">{text}</p>
      )}
      {detail}
      <div className="mt-2 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button size="sm" disabled={busy || !draft.trim()} onClick={() => onEdit(draft.trim())}>
              Save my version
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={onAccept}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
