"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  canSuggest,
  looksLikeStreetAddress,
  PRECISION_LABEL,
  searchAddress,
  suggestAddresses,
  type AddressResult,
} from "./geocode";

/** Suggestions are cheap and built for partial input: fire soon. */
const SUGGEST_PAUSE_MS = 200;
/** Without type-ahead every lookup is a full geocode, which matches half an
 *  address badly: wait for a real pause. */
const SEARCH_PAUSE_MS = 450;

type Item =
  | { kind: "suggestion"; text: string }
  | { kind: "lookup"; text: string }
  | { kind: "result"; result: AddressResult };

const typeAheadAvailable = () => {
  try {
    return canSuggest();
  } catch {
    return false;
  }
};

/**
 * Address lookup for any product's map (./geocode.ts), part of the map engine.
 *
 * Two steps, because the index whose results we may store can't do
 * type-ahead. While typing, suggestions come from the SingleUse index.
 * Picking one (or pressing Enter on what was typed) geocodes that text on
 * the Storage index; an exact or estimated address match is taken at once,
 * anything vaguer is listed with its precision for the user to choose.
 * Replies can arrive out of order, so only the latest request is shown.
 */
export default function AddressSearch({
  onSelect,
  placeholder = "Search an address…",
  bias,
  className,
  inputId,
  initialQuery = "",
  onTextChange,
  fillWith = (r) => r.label,
  noMatchHint = "click the map to drop a pin",
}: {
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  /** Biases results toward a location, e.g. the map's current center. Read
   *  when a request runs, so panning the map never re-runs one. */
  bias?: { latitude: number; longitude: number } | null;
  className?: string;
  /** Used as a form's address field: its label's target. */
  inputId?: string;
  initialQuery?: string;
  /** Every keystroke, so what was typed still counts when nothing is picked (no signal, no match). */
  onTextChange?: (text: string) => void;
  /** What a pick leaves in the box: the full label on the map, the street line in a form. */
  fillWith?: (result: AddressResult) => string;
  /** The fallback the messages point to when search can't place the address. */
  noMatchHint?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<Item[]>([]);
  /** The text the current `result` items answer, for the house-number warning. */
  const [lookedUp, setLookedUp] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef(0);
  const biasRef = useRef(bias);
  biasRef.current = bias;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the query changed because a pick filled it in, so the typing
  // effect doesn't start a new round of suggestions for it.
  const filledRef = useRef(false);

  const biasOpts = () => {
    const b = biasRef.current;
    return b ? { biasLatitude: b.latitude, biasLongitude: b.longitude } : undefined;
  };

  /** Starts a request; `apply` only runs if no newer request started since. */
  function request<T>(p: Promise<T>, apply: (v: T) => void) {
    const seq = ++latestRef.current;
    setLoading(true);
    p.then((v) => {
      if (seq !== latestRef.current) return;
      setError(null);
      setActive(0);
      apply(v);
    })
      .catch((err) => {
        if (seq !== latestRef.current) return;
        console.error("Address search failed", err);
        setError(`Address search isn't answering right now. You can still ${noMatchHint}.`);
        setItems([]);
      })
      .finally(() => {
        if (seq === latestRef.current) setLoading(false);
      });
  }

  const choose = (r: AddressResult) => {
    onSelect(r);
    filledRef.current = true;
    setQuery(fillWith(r));
    setItems([]);
    setOpen(false);
  };

  /** Geocode `text` on the Storage index. */
  const lookUp = (text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    request(searchAddress(text, biasOpts()), (results) => {
      const top = results[0];
      const addressAsked = looksLikeStreetAddress(text);
      // A picked suggestion geocodes back to itself; take it without a
      // second list. Anything less certain is the user's call.
      if (top && addressAsked && (top.precision === "exact" || top.precision === "interpolated")) {
        return choose(top);
      }
      setLookedUp(text);
      setItems(results.map((result) => ({ kind: "result", result })));
      setOpen(true);
    });
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (filledRef.current) {
      filledRef.current = false;
      return;
    }
    const q = query.trim();
    // With no signal there is nothing to ask; what was typed stands.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (q.length < 3 || offline) {
      // Invalidate any reply still in flight for a longer query.
      latestRef.current++;
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    const suggest = typeAheadAvailable();
    timerRef.current = setTimeout(
      () =>
        suggest
          ? request(suggestAddresses(q, biasOpts()), (texts) =>
              setItems([
                ...texts.map((text): Item => ({ kind: "suggestion", text })),
                { kind: "lookup", text: q },
              ])
            )
          : lookUp(q),
      suggest ? SUGGEST_PAUSE_MS : SEARCH_PAUSE_MS
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Helpers read bias and state through refs; only typing starts a round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const pick = (item: Item) => {
    if (item.kind === "result") return choose(item.result);
    filledRef.current = true;
    setQuery(item.text);
    lookUp(item.text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(true);
      if (!loading && items[active]) return pick(items[active]);
      if (query.trim().length >= 3) lookUp(query.trim());
    } else if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const results = items.flatMap((i) => (i.kind === "result" ? [i.result] : []));
  const showingResults = items.length > 0 && items[0].kind === "result";
  // A house number was asked for, and nothing came back at that number.
  const numberMissed =
    showingResults &&
    looksLikeStreetAddress(lookedUp) &&
    !results.some((r) => r.precision === "exact" || r.precision === "interpolated");
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const showDropdown = open && query.trim().length >= 3 && !offline;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          id={inputId}
          onChange={(e) => {
            setQuery(e.target.value);
            onTextChange?.(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="pl-9"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="address-search-list"
          aria-autocomplete="list"
        />
      </div>
      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {loading && items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {showingResults || lookedUp === query.trim()
                ? `No match. Add the city or ZIP, or ${noMatchHint}.`
                : "Keep typing, or press Enter to search."}
            </div>
          ) : (
            <>
              {numberMissed && (
                <div className="border-b border-border bg-warning/10 px-4 py-2 text-xs text-foreground/80">
                  No match for that house number. Check the number, or pick the street below
                  and {noMatchHint}.
                </div>
              )}
              <ul id="address-search-list" role="listbox" className={cn(loading && "opacity-60")}>
                {items.map((item, i) => (
                  <li key={`${item.kind}-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(item)}
                      className={cn(
                        "flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm",
                        i === active && "bg-muted",
                        item.kind === "lookup" && "border-t border-border text-muted-foreground"
                      )}
                    >
                      {item.kind === "lookup" ? (
                        <CornerDownLeft className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      ) : (
                        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" />
                      )}
                      {item.kind === "result" ? (
                        <span className="min-w-0">
                          <span className="block">{item.result.label}</span>
                          <span
                            className={cn(
                              "block text-[11px]",
                              item.result.precision === "exact"
                                ? "font-semibold text-success"
                                : "text-muted-foreground"
                            )}
                          >
                            {PRECISION_LABEL[item.result.precision]}
                          </span>
                        </span>
                      ) : item.kind === "lookup" ? (
                        <span>Look up exactly &ldquo;{item.text}&rdquo;</span>
                      ) : (
                        <span>{item.text}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
