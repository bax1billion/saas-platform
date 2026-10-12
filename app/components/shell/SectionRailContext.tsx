"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { sectionDomId } from "@/lib/hooks/useScrollSpy";
import type { RailSpec } from "@/lib/shell/rail-model";

interface Registration {
  owner: string;
  spec: RailSpec;
}

interface Api {
  register: (owner: string, spec: RailSpec, fallback: boolean) => void;
  unregister: (owner: string, fallback: boolean) => void;
  requestJump: (id: string) => void;
}

const ApiCtx = createContext<Api | null>(null);
const SpecCtx = createContext<RailSpec | null>(null);
const JumpCtx = createContext<{ id: string; seq: number } | null>(null);

/**
 * Carries a page's section list up to the frame, which draws the rail
 * outside the page. Two registrations: the page's own sections, and the
 * product's default (its level-2 routes, registered by `ModuleShell`). The
 * page wins while it is mounted; the default returns when it leaves. Two
 * contexts keep the page from re-rendering on every change: one with
 * stable functions, one with the current spec.
 */
export function SectionRailProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Registration | null>(null);
  const [fallback, setFallback] = useState<Registration | null>(null);
  const [jump, setJump] = useState<{ id: string; seq: number } | null>(null);
  const api = useMemo<Api>(
    () => ({
      register: (owner, spec, isFallback) => (isFallback ? setFallback : setPage)({ owner, spec }),
      unregister: (owner, isFallback) =>
        (isFallback ? setFallback : setPage)((cur) => (cur?.owner === owner ? null : cur)),
      requestJump: (id) => setJump((cur) => ({ id, seq: (cur?.seq ?? 0) + 1 })),
    }),
    []
  );
  return (
    <ApiCtx.Provider value={api}>
      <SpecCtx.Provider value={page?.spec ?? fallback?.spec ?? null}>
        <JumpCtx.Provider value={jump}>{children}</JumpCtx.Provider>
      </SpecCtx.Provider>
    </ApiCtx.Provider>
  );
}

export const useRailSpec = () => useContext(SpecCtx);
export const useRailJump = () => useContext(JumpCtx);

/**
 * A page declares its sections, tabs or stages once per render. Without a
 * provider (a record reused outside `ModuleShell`) everything is a no-op
 * and the page still renders. The key is plain data, so a new `items`
 * array with the same content does not re-register; `onSelect` goes
 * through a ref so a changing handler cannot loop.
 *
 * `sectionProps(id)` gives each section wrapper its DOM id, `tabIndex` and
 * `data-section`; the page adds `className={SECTION_CLASS}` itself.
 *
 * `fallback` is for the frame only: the product's routes, shown when no
 * page has registered anything.
 */
export function useSections(spec: RailSpec, opts: { fallback?: boolean } = {}) {
  const { fallback = false } = opts;
  const api = useContext(ApiCtx);
  const owner = useId();
  const select = useRef(spec.onSelect);
  useEffect(() => {
    select.current = spec.onSelect;
  });
  const key = JSON.stringify({ mode: spec.mode, label: spec.label, items: spec.items, activeId: spec.activeId });
  const plain = useMemo(() => JSON.parse(key) as Omit<RailSpec, "onSelect">, [key]);
  useEffect(() => {
    if (!api) return;
    api.register(owner, { ...plain, onSelect: (id) => select.current?.(id) }, fallback);
    return () => api.unregister(owner, fallback);
  }, [api, owner, plain, fallback]);
  const sectionProps = useCallback((id: string) => ({ id: sectionDomId(id), tabIndex: -1, "data-section": id }), []);
  const scrollTo = useCallback((id: string) => api?.requestJump(id), [api]);
  return { sectionProps, scrollTo };
}
