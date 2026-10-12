"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeRootMargin, isAtBottom, pickActiveId, readPx } from "./scroll-spy";

export const sectionDomId = (id: string) => `sec-${id}`;

/**
 * One IntersectionObserver over the registered sections. The reading band
 * is computed from the live bar heights (`--bs-top-h`, `--bs-rail-h`) and
 * rebuilt on resize and when `watchKey` changes (the strip passes its
 * measured height).
 *
 * The click rule, moved here from the first per-module rail: a click sets the highlight at
 * once and suppresses the observer so a short neighbour cannot steal it
 * mid-scroll; the next real user scroll (wheel, touch, pointer, key) or
 * `scrollend` releases it. No timer: a fixed delay cannot track variable
 * scroll distances. Arrow keys pressed inside the rail are not scrolling.
 */
export function useScrollSpy(opts: { ids: readonly string[]; watchKey?: string | number; enabled?: boolean }) {
  const { ids, watchKey = 0, enabled = true } = opts;
  const idsKey = ids.join("|");
  const order = useMemo(() => (idsKey ? idsKey.split("|") : []), [idsKey]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const suppress = useRef(false);

  useEffect(() => {
    if (!enabled || order.length === 0 || typeof IntersectionObserver === "undefined") return;
    const inBand = new Set<string>();
    let io: IntersectionObserver | null = null;
    const observe = () => {
      io?.disconnect();
      inBand.clear();
      const css = getComputedStyle(document.documentElement);
      const rootMargin = computeRootMargin({
        topBarPx: readPx(css.getPropertyValue("--bs-top-h"), 56),
        railPx: readPx(css.getPropertyValue("--bs-rail-h"), 0),
        viewportPx: window.innerHeight,
      });
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.section;
            if (!id) continue;
            if (e.isIntersecting) inBand.add(id);
            else inBand.delete(id);
          }
          if (!suppress.current) setActiveId((prev) => pickActiveId(order, inBand, prev));
        },
        { rootMargin, threshold: 0 }
      );
      for (const id of order) {
        const el = document.getElementById(sectionDomId(id));
        if (el) io.observe(el);
      }
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      window.removeEventListener("resize", observe);
      io?.disconnect();
    };
  }, [order, watchKey, enabled]);

  useEffect(() => {
    if (!enabled || order.length === 0) return;
    const resume = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("[data-section-rail]")) return;
      suppress.current = false;
    };
    const done = () => {
      suppress.current = false;
    };
    const onScroll = () => {
      if (suppress.current) return;
      const el = document.scrollingElement ?? document.documentElement;
      if (isAtBottom(el)) setActiveId(order[order.length - 1]);
    };
    window.addEventListener("wheel", resume, { passive: true });
    window.addEventListener("touchmove", resume, { passive: true });
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("keydown", resume);
    window.addEventListener("scrollend", done);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", resume);
      window.removeEventListener("touchmove", resume);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("scrollend", done);
      window.removeEventListener("scroll", onScroll);
    };
  }, [order, enabled]);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(sectionDomId(id));
    if (!el) return;
    suppress.current = true;
    setActiveId(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // The next Tab continues from the section, not from the rail.
    el.focus({ preventScroll: true });
  }, []);

  return { activeId, jump };
}
