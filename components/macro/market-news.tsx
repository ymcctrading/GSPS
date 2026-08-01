"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ImpactTier, NewsEvent } from "@/lib/macro/news";

/**
 * Market News — an economic calendar/news feed modelled on Forex Factory's
 * layout: date headers grouping the day's releases, a coloured impact-tier
 * marker per row (red/orange/yellow, matching FF's convention), a region flag,
 * asset relevance tags, and a clean one-line headline + detail.
 */
export function MarketNews() {
  const [events, setEvents] = useState<NewsEvent[] | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [impactFilter, setImpactFilter] = useState<Set<ImpactTier>>(
    new Set(["high", "medium", "low"]),
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/macro/news?days=14")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setEvents(d.events ?? []);
        setSimulated(Boolean(d.simulated));
      })
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const filtered = (events ?? []).filter((e) => impactFilter.has(e.impact));
    const map = new Map<string, NewsEvent[]>();
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, impactFilter]);

  function toggleImpact(tier: ImpactTier) {
    setImpactFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      // Never allow an empty filter — that would read as "no news" rather
      // than "nothing selected".
      return next.size === 0 ? new Set(["high", "medium", "low"]) : next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Market news</CardTitle>
            <CardDescription>Macro releases for the next two weeks.</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {(["high", "medium", "low"] as ImpactTier[]).map((tier) => (
              <ImpactChip
                key={tier}
                tier={tier}
                active={impactFilter.has(tier)}
                onClick={() => toggleImpact(tier)}
              />
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <div className="py-8 text-center text-sm text-muted">Loading market news…</div>
        ) : grouped.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">No releases match the current filter.</div>
        ) : (
          <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
            {grouped.map(([date, dayEvents]) => (
              <div key={date}>
                <h4 className="mb-1.5 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </h4>
                <div className="flex flex-col divide-y divide-border">
                  {dayEvents.map((e) => (
                    <NewsRow key={e.id} event={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted/80">
          {simulated
            ? "Demo calendar — release timing follows the real macro schedule shape, not live confirmed times."
            : "Live macro news feed."}
        </p>
      </CardContent>
    </Card>
  );
}

const IMPACT_META: Record<ImpactTier, { label: string; dot: string; text: string }> = {
  high: { label: "High", dot: "bg-bear", text: "text-bear" },
  medium: { label: "Med", dot: "bg-warn", text: "text-warn" },
  low: { label: "Low", dot: "bg-muted", text: "text-muted" },
};

function ImpactChip({
  tier,
  active,
  onClick,
}: {
  tier: ImpactTier;
  active: boolean;
  onClick: () => void;
}) {
  const meta = IMPACT_META[tier];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
        active ? "border-border bg-background" : "border-transparent opacity-40",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {meta.label}
    </button>
  );
}

function NewsRow({ event }: { event: NewsEvent }) {
  const meta = IMPACT_META[event.impact];
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className="w-12 shrink-0 font-mono text-xs text-muted">{event.time}</span>
      <span
        className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", meta.dot)}
        title={`${meta.label} impact`}
      />
      <span className="w-7 shrink-0 text-xs font-semibold text-muted">{event.region}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{event.headline}</p>
        {event.detail && <p className="truncate text-xs text-muted">{event.detail}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {event.assetTags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
