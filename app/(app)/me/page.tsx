"use client";

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useDoorChoices } from "@/app/components/DoorContext";
import FlagIt from "@/app/components/FlagIt";
import { PlacePage } from "@/app/components/shell/PlacePage";
import { doorLabels, shellLabels, textSizeLabels } from "@/config/shell";
import type { ManualSidebar } from "@/lib/hooks/layout-mode";
import { canManageOrg } from "@/lib/roles";
import { writeShellPreference, type TextSize } from "@/lib/shell/preference-store";
import { useShellPreference } from "@/lib/shell/useShellPreference";
import { cn } from "@/lib/utils";

function Chips<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "min-h-12 rounded-full border px-5 text-[17px] font-medium transition-colors",
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const SIDEBAR_OPTIONS: { id: "auto" | "full" | "compact"; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "full", label: "Expanded" },
  { id: "compact", label: "Collapsed" },
];

/**
 * Me: the member's own place. Door choice (Admin only when offered), text
 * size, the sidebar preference for bigger screens, Flag it, the
 * organization and sign out. Every control writes the shell preference
 * store, which the frame reads live. Profile, support and theme are a
 * product's own additions.
 */
export default function MePage() {
  const { user, handleSignOut } = useAuth();
  const doors = useDoorChoices();
  const { sidebar, textSize } = useShellPreference();
  const manager = canManageOrg(user?.groups);

  return (
    <PlacePage title="Me" lead={user?.email ?? undefined}>
      <Card title={shellLabels.door}>
        <Chips
          label={shellLabels.door}
          value={doors.door}
          options={doors.offered.map((d) => ({ id: d, label: doorLabels[d] }))}
          onPick={doors.setDoor}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Field is touch and big targets. Station is the desk. Admin is settings and shows only for members with Admin access, on the Admin pages of a product.
        </p>
        {doors.hasChoice && (
          <button type="button" onClick={doors.resetDoor} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">
            {shellLabels.autoDoor}
          </button>
        )}
      </Card>

      <Card title={shellLabels.textSize}>
        <Chips
          label={shellLabels.textSize}
          value={textSize}
          options={(Object.keys(textSizeLabels) as TextSize[]).map((t) => ({ id: t, label: textSizeLabels[t] }))}
          onPick={(t) => writeShellPreference({ textSize: t })}
        />
      </Card>

      <Card title="Sidebar">
        <Chips
          label="Sidebar"
          value={sidebar ?? "auto"}
          options={SIDEBAR_OPTIONS}
          onPick={(v) => writeShellPreference({ sidebar: v === "auto" ? null : (v as ManualSidebar) })}
        />
        <p className="mt-3 text-sm text-muted-foreground">Applies on screens wide enough for a sidebar. Auto follows the layout rule and collapses when a record opens its section rail.</p>
      </Card>

      <Card title={shellLabels.flagIt}>
        <FlagIt className="min-h-12 text-[17px]" />
        <p className="mt-3 text-sm text-muted-foreground">Report a problem from any screen. Where you were is filled in for you.</p>
      </Card>

      <Card title={shellLabels.account}>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-[17px] font-medium hover:bg-muted">
            {shellLabels.organization}
          </Link>
          {manager && (
            <Link href="/settings/billing" className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-[17px] font-medium hover:bg-muted">
              {shellLabels.billing}
            </Link>
          )}
          <button type="button" onClick={() => handleSignOut()} className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-[17px] font-semibold text-primary-foreground hover:bg-primary/90">
            {shellLabels.signOut}
          </button>
        </div>
      </Card>
    </PlacePage>
  );
}
