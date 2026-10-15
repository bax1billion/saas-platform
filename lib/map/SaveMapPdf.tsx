"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataUrlBytes, imagePdf } from "@/lib/pdf/image-pdf";
import type { Snapshot } from "./canvas";

export interface MapCapture {
  snapshot: Snapshot;
  /** Lines under the title: place, time, centre, a measurement. */
  details: string[];
  /** The basemap's credits, as the map shows them. */
  credits: string;
}

function fileName(title: string, at: Date): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "map";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${slug}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.pdf`;
}

/**
 * Saves the map exactly as it is on screen (camera, basemap, marks, labels,
 * a measure line) as a one-page PDF on this device. Built in the browser,
 * so it works with no signal for whatever the map has already drawn.
 * Marks the organization marked sensitive are left out unless the person
 * includes them, and a copy that includes them says not to release it.
 */
export default function SaveMapPdf({
  defaultTitle,
  capture,
  disabled,
}: {
  defaultTitle: string;
  capture: (includeSensitive: boolean) => Promise<MapCapture>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The file the last save produced, or why it failed; inline, no toasts (CLAUDE.md). */
  const [result, setResult] = useState<{ ok: true; name: string } | { ok: false; message: string } | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const { snapshot, details, credits } = await capture(includeSensitive);
      const footer = [
        includeSensitive
          ? "Contains marks the organization marked sensitive. For internal use; do not release."
          : snapshot.leftOut
            ? `${snapshot.leftOut} sensitive mark${snapshot.leftOut === 1 ? "" : "s"} left out of this copy.`
            : "No sensitive marks in this view.",
        "Distances are straight lines between two points, not a survey.",
        ...(credits ? [`Map: ${credits}`] : []),
      ];
      const pdf = imagePdf({
        jpeg: dataUrlBytes(snapshot.dataUrl),
        width: snapshot.width,
        height: snapshot.height,
        title: title.trim() || defaultTitle,
        lines: details,
        footer,
      });
      const url = URL.createObjectURL(new Blob([pdf.slice().buffer], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(title.trim() || defaultTitle, new Date());
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setResult({ ok: true, name: a.download });
      setOpen(false);
    } catch (err) {
      console.error(err);
      setResult({ ok: false, message: err instanceof Error ? err.message : "Could not save the map" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setTitle(defaultTitle);
          setOpen(true);
        }}
        className="inline-flex min-h-target items-center gap-1.5 px-3 text-field font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <FileDown className="h-4 w-4" aria-hidden />
        Save PDF
      </button>
      {result?.ok && (
        <span role="status" aria-live="polite" className="self-center px-2 text-sm text-muted-foreground">
          Saved {result.name}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this map view as a PDF</DialogTitle>
            <DialogDescription>
              Exactly what is on screen now: the basemap, marks and labels, and a measured distance if one is showing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="map-pdf-title">Title</Label>
              <Input id="map-pdf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {result && !result.ok && (
              <p role="alert" className="text-sm text-destructive">
                Not saved: {result.message}
              </p>
            )}
            <label className="flex min-h-target items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5"
                checked={includeSensitive}
                onChange={(e) => setIncludeSensitive(e.target.checked)}
              />
              <span>
                <span className="font-medium text-foreground">Include sensitive marks</span>
                <br />
                <span className="text-muted-foreground">Marks and symbols your organization marked sensitive. Off by default; the PDF says not to release it.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
