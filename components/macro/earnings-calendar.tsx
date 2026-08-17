"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, tickerHref } from "@/lib/utils";
import type { EarningsEvent } from "@/lib/macro/earnings";

/**
 * Monthly earnings calendar, filtered to Fortune-500-tier / major-index names
 * (see `lib/macro/universe.ts`). No small/mid-cap noise — every cell here is a
 * name liquid enough to matter for the scanner's watchlist.
 */
export function EarningsCalendar() {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<EarningsEvent[] | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Clear the grid the moment the visible month changes — a render-phase
  // adjustment (React's alternative to an effect for this), so the switch to
  // "loading" can't lag a commit behind the click.
  const [loadedMonth, setLoadedMonth] = useState(anchor.getTime());
  if (anchor.getTime() !== loadedMonth) {
    setLoadedMonth(anchor.getTime());
    setEvents(null);
  }

  useEffect(() => {
    let cancelled = false;
    const month = anchor.toISOString().slice(0, 7);
    fetch(`/api/macro/earnings?month=${month}`)
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
  }, [anchor]);

  const byDate = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    for (const e of events ?? []) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const monthLabel = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Earnings calendar</CardTitle>
            <CardDescription>Mega-cap / major-index releases only.</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <NavButton onClick={() => setAnchor((d) => shiftMonth(d, -1))} label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <span className="w-28 text-center text-sm font-medium">{monthLabel}</span>
            <NavButton onClick={() => setAnchor((d) => shiftMonth(d, 1))} label="Next month">
              <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <div className="py-8 text-center text-sm text-muted">Loading earnings calendar…</div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell) return <div key={i} className="aspect-square" />;
                const iso = cell.toISOString().slice(0, 10);
                const dayEvents = byDate.get(iso) ?? [];
                const isToday = iso === todayIso;
                return (
                  <button
                    key={iso}
                    onClick={() => dayEvents.length > 0 && setSelected(iso === selected ? null : iso)}
                    className={cn(
                      "flex aspect-square flex-col items-start gap-0.5 rounded-md border p-1 text-left transition-colors",
                      dayEvents.length > 0 ? "cursor-pointer hover:border-accent" : "cursor-default",
                      iso === selected ? "border-accent bg-accent-soft" : "border-border",
                      isToday && "ring-1 ring-accent/60",
                    )}
                  >
                    <span className={cn("text-[11px]", isToday ? "font-bold text-accent" : "text-muted")}>
                      {cell.getUTCDate()}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.symbol}
                          className="rounded bg-accent-soft px-1 py-0.5 text-[9px] font-semibold text-accent"
                        >
                          {e.symbol}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-muted">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected && selectedEvents.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </h4>
                {selectedEvents.map((e) => (
                  <div key={e.symbol} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={tickerHref(e.symbol)} className="font-medium text-accent hover:underline">
                        {e.symbol}
                      </Link>
                      <span className="text-muted">{e.name}</span>
                    </div>
                    <Badge variant="muted">{e.timing === "BMO" ? "Before open" : "After close"}</Badge>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-xs text-muted/80">
              {simulated
                ? "Dates are modelled from each company's typical reporting cadence — confirm exact timing before trading around a release."
                : "Live earnings calendar."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground cursor-pointer"
    >
      {children}
    </button>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function shiftMonth(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** Calendar grid cells for the month containing `anchor`, padded to full weeks. */
function buildMonthGrid(anchor: Date): (Date | null)[] {
  const first = startOfMonth(anchor);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leadingBlanks = first.getUTCDay(); // 0=Sun
  const cells: (Date | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
