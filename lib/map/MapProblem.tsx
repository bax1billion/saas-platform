"use client";

/**
 * Why the map's marks or symbols did not load or save, in place above the
 * map, until the next save that works or Dismiss. The map hooks
 * (useMapMarks, useSymbolTypes) set it; nothing on a map toasts (CLAUDE.md,
 * "a toast is never done").
 */
export function MapProblem({ problem, onDismiss }: { problem: string | null; onDismiss: () => void }) {
  if (!problem) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-field text-destructive"
    >
      <span className="flex-1">{problem}</span>
      <button type="button" onClick={onDismiss} className="min-h-12 shrink-0 px-2 font-medium underline underline-offset-2">
        Dismiss
      </button>
    </div>
  );
}
