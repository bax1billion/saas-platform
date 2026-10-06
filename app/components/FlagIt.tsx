"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { getDataClient } from "@/lib/data-client";
import { useAuth } from "./AuthContext";
import { useEntitlements } from "./EntitlementsContext";
import { getModuleByPath } from "@/lib/modules";
import { cn } from "@/lib/utils";

/**
 * Flag it: a tester reports a problem from any screen. The shell fills in
 * where they were (product, screen, role, device, version); the tester
 * answers two questions. Lands in TesterFlag for the Admin and Operator
 * inbox and in the audit trail.
 */
export default function FlagIt({
  product,
  version,
  className,
}: {
  /** Override the product label (the demo lane passes the prototype name). */
  product?: string;
  version?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { org } = useEntitlements();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const productLabel = product ?? getModuleByPath(pathname)?.name ?? "Platform";
  const role = user?.groups?.join(", ") || "Member";
  const device = typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 160);
  const autoLine = [productLabel, pathname, role, version].filter(Boolean).join(" · ");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const happened = String(data.get("happened") ?? "").trim();
    if (!happened) return;
    setSending(true);
    try {
      const { errors } = await getDataClient().models.TesterFlag.create({
        orgId: org?.id ?? undefined,
        product: productLabel,
        screen: pathname,
        role,
        device,
        version: version ?? undefined,
        happened,
        expected: String(data.get("expected") ?? "").trim() || undefined,
        createdBy: user?.email ?? undefined,
        status: "OPEN",
        sortDate: new Date().toISOString(),
      });
      if (errors?.length) throw new Error(errors[0].message);
      toast.success("Sent. Thank you.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted",
          className
        )}
      >
        <Flag className="h-3.5 w-3.5" /> Flag it
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-brand-dark/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
          >
            <h2 className="text-xl font-bold text-foreground">Flag a problem</h2>
            <p className="mt-1 text-xs text-muted-foreground">Filled in for you: {autoLine}</p>
            <label className="mt-4 block text-sm font-semibold text-foreground">
              What happened?
              <textarea name="happened" rows={3} required className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-sm font-semibold text-foreground">
              What did you expect?
              <textarea name="expected" rows={2} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={sending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
