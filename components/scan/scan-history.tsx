"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { MONITOR_STATE_LABELS, type MonitorState, type ScanHistoryRun } from "@/lib/scanner/history";
import { formatUsd, cn } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";

/**
 * "What did I scan, and has it changed" — read-only, on a fixed lookback
 * (default 7 days). Every row's "now" column is a live monitor read, not a
 * rescan: see the header comment on app/api/scan-history/route.ts for why
 * that's a deliberate choice, and why some symbols show "not tracked" rather
 * than a guessed current state.
 */

const DAYS_OPTIONS = [1, 7, 30] as const;

export function ScanHistory() {
  const [days, setDays] = useState<(typeof DAYS_OPTIONS)[number]>(7);
  const [runs, setRuns] = useState<ScanHistoryRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/scan-history?days=${days}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRuns(data.runs ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    // Scheduled rather than called inline: `load` flips the loading flag
    // synchronously, and doing that inside the effect body would set state
    // during the same commit that mounted the panel.
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Scan history</CardTitle>
            <CardDescription>
              Symbols you scanned, and what they read as now — not a rescan, a live check
              against each symbol&apos;s tracked status for your account.
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  days === d ? "border-accent bg-accent-soft text-accent" : "text-muted hover:text-foreground",
                )}
              >
                {d === 1 ? "Today" : d === 7 ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-bear">{error}</p>}
        {loading && !runs && <p className="text-sm text-muted">Loading…</p>}
        {runs && runs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No scans in this window yet. Run one above and it will show up here.
          </p>
        )}
        {runs?.map((run, i) => (
          <div key={run.scanExecutionId ?? i} className="rounded-lg border border-border">
            <div className="border-b border-border bg-background/50 px-3 py-2 text-xs text-muted">
              Scanned {formatOpenedAt(run.runAt)} · {run.symbols.length} symbol
              {run.symbols.length === 1 ? "" : "s"}
            </div>
            <div className="divide-y divide-border">
              {run.symbols.map((s) => (
                <div
                  key={s.symbol}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Link href={tickerHref(s.symbol)} className="font-medium text-accent hover:underline">
                      {s.symbol}
                    </Link>
                    <ScoreBadge score={s.score} state={s.scannedState} />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">now:</span>
                    {s.currentState === null ? (
                      <Badge variant="muted">Not tracked since</Badge>
                    ) : (
                      <MonitorBadge state={s.currentState} />
                    )}
                    {s.changed && (
                      <Badge variant="warn" className="ml-1">
                        Changed
                      </Badge>
                    )}
                    {s.currentStateAsOf && (
                      <span className="hidden text-xs text-muted sm:inline">
                        as of {formatOpenedAt(s.currentStateAsOf)}
                      </span>
                    )}
                  </div>
                  {s.entry != null && (
                    <div className="w-full text-xs text-muted sm:w-auto">
                      Entry {formatUsd(s.entry)}
                      {s.stopLoss != null && ` · Stop ${formatUsd(s.stopLoss)}`}
                      {s.takeProfit1 != null && ` · TP1 ${formatUsd(s.takeProfit1)}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MonitorBadge({ state }: { state: MonitorState }) {
  const variant = state === "EXECUTE" ? "bull" : state === "WATCH" ? "warn" : "muted";
  return <Badge variant={variant}>{MONITOR_STATE_LABELS[state]}</Badge>;
}
