"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { shellLabels, shellPlaces } from "@/config/shell";
import { cn } from "@/lib/utils";
import FlagIt from "../FlagIt";
import { placeIcon } from "./place-icons";

/**
 * Quick: the round button at the capsule's end. It will open the
 * universal input sheet (talk, photo, attach, tags) when a product builds
 * one; until then the sheet says so and offers the one capture that works
 * everywhere, Flag it. Never an extra tab, never a cradled centre button.
 * The sheet is the shared Radix dialog (focus trap, Escape, labelling)
 * pinned to the bottom edge for the thumb.
 */
function QuickButton() {
  return (
    <Dialog>
      <DialogTrigger
        aria-label={shellLabels.quick}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-6 w-6" />
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-1/2 max-w-md translate-y-0 rounded-b-none rounded-t-2xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>{shellLabels.quick}</DialogTitle>
          <DialogDescription className="text-field leading-snug">
            Talk, photo, attach and tags arrive with the input box. Until then, Quick holds the one capture that works everywhere.
          </DialogDescription>
        </DialogHeader>
        <FlagIt className="min-h-target w-full justify-center text-field" />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The phone layout's navigation (a phone at every door, a tablet in the
 * Field door): a floating capsule with the places and Quick attached to
 * its right end. It never auto-hides on scroll; the canvas gets
 * bottom padding equal to the capsule plus the safe area so nothing sits
 * under it.
 */
export default function FloatingToolbar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(14px,env(safe-area-inset-bottom))] print:hidden">
      <div className="pointer-events-auto flex items-center gap-2">
        <nav aria-label="Places" className="h-[var(--toolbar-h)] rounded-full border border-border bg-background/95 px-1 shadow-lg backdrop-blur">
          <ul className="flex h-full items-stretch">
            {shellPlaces.map((p) => {
              const Icon = placeIcon(p.icon);
              const active = isActive(p.href);
              return (
                <li key={p.id} className="flex">
                  <Link
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-w-12 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[12px] font-medium leading-none",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
                    <span>{p.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <QuickButton />
      </div>
    </div>
  );
}
