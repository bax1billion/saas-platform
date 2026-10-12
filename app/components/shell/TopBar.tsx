"use client";

import FlagIt from "../FlagIt";
import AvatarMenu from "./AvatarMenu";
import Breadcrumbs from "./Breadcrumbs";

/**
 * The frame's top bar: sticky, in flow (a sticky element keeps its space,
 * so the canvas needs no padding for it), 56 px from `--topbar-h`. Left
 * the breadcrumbs; right the member's menu. The Search button and the
 * bell take their places here when the palette and notifications exist;
 * until then nothing pretends to.
 *
 * On the toolbar layout (no sidebar) Flag it rides here so it never leaves
 * a screen.
 */
export default function TopBar({ toolbar }: { toolbar: boolean }) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-40 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-border bg-background px-3 print:hidden md:px-4"
    >
      <Breadcrumbs />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {toolbar && <FlagIt iconOnly className="h-11 w-11 justify-center border-transparent p-0" />}
        <AvatarMenu />
      </div>
    </header>
  );
}
