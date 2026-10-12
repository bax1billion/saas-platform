"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { shellPlaces } from "@/config/shell";
import { crumbsFor } from "@/lib/modules/breadcrumbs";
import { cn } from "@/lib/utils";

const KNOWN = Object.fromEntries(shellPlaces.map((p) => [p.href, p.label]));

/** The route as a trail. On a phone only the last two crumbs show. */
export default function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname, { known: KNOWN });
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const current = i === last;
          const phoneHidden = i < last - 1;
          return (
            <li key={c.href} className={cn("flex min-w-0 items-center gap-1", phoneHidden && "hidden md:flex")}>
              {i > 0 && <ChevronRight aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", i === last - 1 && "hidden md:block")} />}
              {current ? (
                <span aria-current="page" className="truncate font-semibold text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="flex min-h-11 items-center truncate text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
