"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PickerList, PickerSector } from "@/lib/universe/selection";

export interface IndustryData {
  sectors: PickerSector[];
  lists: PickerList[];
  /** Sectors listed but not yet scannable (futures, forex). */
  unavailable?: string[];
}

/** Every listed symbol by sector and industry, from `/api/industries`. */
export function useIndustries(): { data: IndustryData | null; error: string | null } {
  const [data, setData] = useState<IndustryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/industries");
        if (!res.ok) throw new Error(`Industries failed to load (${res.status})`);
        const body = (await res.json()) as IndustryData;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { data, error };
}

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors cursor-pointer";

/**
 * Pick whole sectors or single industries, across stocks, funds, crypto,
 * futures and forex. Typing a symbol shows which industry holds it, so nobody
 * has to work that out for themselves.
 */
export function IndustryPicker({
  data,
  selected,
  onChange,
}: {
  data: IndustryData;
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  const matches = useMemo(() => {
    if (!q) return null;
    const hit = new Map<string, string | null>();
    for (const s of data.sectors) {
      for (const i of s.industries) {
        const symbol = i.symbols.find((x) => x.toLowerCase() === q || x.toLowerCase() === `${q}/usd`);
        if (symbol) hit.set(i.key, symbol);
        else if (i.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)) hit.set(i.key, null);
      }
    }
    return hit;
  }, [data, q]);

  const quick = data.lists.filter((l) => l.key === "mag7" || selected.includes(l.key));
  const allKeys = new Map<string, number>();
  for (const l of data.lists) allKeys.set(l.key, l.symbols.length);
  for (const s of data.sectors) for (const i of s.industries) allKeys.set(i.key, i.symbols.length);
  const symbolCount = new Set(
    selected.flatMap((k) =>
      data.lists.find((l) => l.key === k)?.symbols ??
      data.sectors.flatMap((s) => s.industries).find((i) => i.key === k)?.symbols ??
      [],
    ),
  ).size;

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Find an industry, or type a symbol to see its industry (e.g. NVDA)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quick.map((l) => (
            <button
              key={l.key}
              onClick={() => toggle(l.key)}
              className={cn(
                chip,
                selected.includes(l.key)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {l.label}
              <span className="text-xs opacity-70">{l.symbols.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {data.sectors.map((s) => {
          const industries = matches ? s.industries.filter((i) => matches.has(i.key)) : s.industries;
          if (matches && industries.length === 0) return null;
          const expanded = !!matches || open.includes(s.key);
          const keys = s.industries.map((i) => i.key);
          const all = keys.every((k) => selected.includes(k));
          const some = keys.filter((k) => selected.includes(k)).length;
          const size = s.industries.reduce((n, i) => n + i.symbols.length, 0);
          return (
            <div key={s.key} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() =>
                    setOpen((prev) => (prev.includes(s.key) ? prev.filter((k) => k !== s.key) : [...prev, s.key]))
                  }
                  className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium cursor-pointer"
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {s.industries.length} {s.industries.length === 1 ? "group" : "groups"} · {size}
                    {some > 0 && !all ? ` · ${some} picked` : ""}
                  </span>
                </button>
                <button
                  onClick={() =>
                    onChange(all ? selected.filter((k) => !keys.includes(k)) : [...new Set([...selected, ...keys])])
                  }
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer",
                    all ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {all ? "All picked" : "Pick all"}
                </button>
              </div>
              {expanded && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {industries.map((i) => {
                    const hitSymbol = matches?.get(i.key);
                    return (
                      <button
                        key={i.key}
                        onClick={() => toggle(i.key)}
                        title={i.symbols.join(", ")}
                        className={cn(
                          chip,
                          selected.includes(i.key)
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border text-muted hover:text-foreground",
                        )}
                      >
                        {i.label}
                        <span className="text-xs opacity-70">{i.symbols.length}</span>
                        {hitSymbol && <span className="text-xs text-foreground">· {hitSymbol}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {matches && matches.size === 0 && (
          <p className="px-3 py-2 text-sm text-muted">
            Nothing matches. A symbol the platform doesn&apos;t list can still be typed into the symbols box.
          </p>
        )}
      </div>

      {data.unavailable && data.unavailable.length > 0 && (
        <p className="text-xs text-muted">
          {data.unavailable.join(" and ")}: live quotes only for now, so they can&apos;t be scanned or tested yet.
        </p>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {selected.filter((k) => allKeys.has(k)).length} picked · {symbolCount} symbols
          </span>
          <button
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
