"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { tickerHref } from "@/lib/routes";
import type { SymbolSearchResult } from "@/app/api/symbols/search/route";

/**
 * Header search: ticker or company name.
 * -----------------------------------------------------------------------------
 * A novice searching "eli lilly" should land on LLY without ever needing to
 * know the ticker. Typing 3+ letters debounces a lookup against
 * /api/symbols/search (ticker prefix, then ticker substring, then company
 * name) and shows a dropdown of matches. Enter with no match selected still
 * navigates on the raw typed symbol, so a known ticker works with zero
 * network round trips and crypto pairs (not in the equity search index)
 * still resolve.
 */
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 200;

export function SymbolSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup only — the fetch itself is triggered from the input's onChange
  // (below), not from an effect body, so no setState happens synchronously
  // during render/commit.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetch(`/api/symbols/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data: { results?: SymbolSearchResult[] }) => {
          setResults(data.results ?? []);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => setResults([]));
    }, DEBOUNCE_MS);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(tickerHref(symbol));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) setActiveIndex((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeIndex >= 0 ? results[activeIndex] : null;
      const symbol = picked?.symbol ?? query.trim().toUpperCase();
      if (symbol) go(symbol);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 max-w-[9rem] sm:max-w-[14rem] lg:max-w-xs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search ticker or company"
          aria-label="Search ticker or company name"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="symbol-search-listbox"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      {open && results.length > 0 && (
        <ul
          id="symbol-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {results.map((r, i) => (
            <li key={r.symbol} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => go(r.symbol)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  i === activeIndex ? "bg-accent-soft text-accent" : "hover:bg-accent-soft"
                }`}
              >
                <span className="shrink-0 font-mono font-semibold">{r.symbol}</span>
                <span className="min-w-0 truncate text-xs text-muted">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
