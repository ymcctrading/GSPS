"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import type {
  ForwardTestByVersion,
  ForwardTestRow,
  PastScanChange,
  PastScanCompared,
  PastScanRow,
} from "@/lib/scanner/pastScans";
import { walkedOnEarlierRules } from "@/lib/scanner/pastScans";
import { latestProductionReplay, PRODUCTION_REPLAY_RUNS, type ReplayReference } from "@/lib/backtest/replayReference";
import { formatUsd } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";

/**
 * Two sessions' published daily lists side by side, and the forward test
 * beside the replay (Q2 item 5). A record read back, not a re-scan: see
 * `app/api/past-scans/route.ts` and `lib/scanner/pastScans.ts`.
 */

interface PastScansResponse {
  dates: string[];
  earlier: string | null;
  later: string | null;
  rows: PastScanCompared[];
  forwardByVersion: ForwardTestByVersion[] | null;
  exactScoreDisplayEnabled: boolean;
  note?: string;
}

const CHANGE_LABELS: Record<PastScanChange, { label: string; variant: "bull" | "bear" | "warn" | "muted" | "default" } | null> = {
  same: null,
  new: { label: "New", variant: "default" },
  gone: { label: "Off the list", variant: "muted" },
  to_execute: { label: "Now Execute", variant: "bull" },
  to_watch: { label: "Now Watch", variant: "warn" },
  to_reject: { label: "Now rejected", variant: "muted" },
};

const OUTCOME_LABELS: Record<NonNullable<ForwardTestRow["outcome"]>, string> = {
  win: "Won",
  loss: "Lost",
  timeout: "Held to 10 sessions",
  expired: "Never filled",
  retired: "Stop broke first",
};

function formatSession(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatR(r: number): string {
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R`;
}

function formatPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function PastScans() {
  const [earlier, setEarlier] = useState<string | null>(null);
  const [later, setLater] = useState<string | null>(null);
  const [data, setData] = useState<PastScansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (earlier) params.set("earlier", earlier);
    if (later) params.set("later", later);
    fetch(`/api/past-scans?${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body as PastScansResponse);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [earlier, later]);

  useEffect(() => {
    // Scheduled, as the History tab does: `load` sets state synchronously.
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  const shownEarlier = data?.earlier ?? earlier;
  const shownLater = data?.later ?? later;
  const exact = data?.exactScoreDisplayEnabled ?? false;
  const bullish = data?.rows.filter((r) => r.direction === "bullish") ?? [];
  const bearish = data?.rows.filter((r) => r.direction === "bearish") ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Past scans</CardTitle>
          <CardDescription>
            Two days&apos; Buy and Sell lists as they were published, what changed between them, and what the forward
            test recorded for each Execute. A record of past calls, not a forecast.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data && data.dates.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <DatePicker
                label="Earlier"
                dates={data.dates}
                value={shownEarlier}
                onChange={(d) => {
                  setEarlier(d);
                  setLater(shownLater);
                }}
              />
              <DatePicker
                label="Later"
                dates={data.dates}
                value={shownLater}
                onChange={(d) => {
                  setLater(d);
                  setEarlier(shownEarlier);
                }}
              />
            </div>
          )}
          {error && <p className="text-sm text-bear">{error}</p>}
          {loading && !data && <p className="text-sm text-muted">Loading…</p>}
          {data?.note && <p className="text-sm text-muted">{data.note}</p>}
          {data && data.earlier && data.later && (
            <>
              <DirectionList
                title="Buy list"
                rows={bullish}
                earlier={data.earlier}
                later={data.later}
                exact={exact}
              />
              <DirectionList
                title="Sell list"
                rows={bearish}
                earlier={data.earlier}
                later={data.later}
                exact={exact}
              />
              <p className="text-xs text-muted">
                The forward test follows only the Execute calls the scheduled scan made, entering on the reaction and
                exiting on the plan&apos;s exit rules as a live trade would. A Watch is not a call, so it has no result; it shows
                the day it became an Execute, if it did before the later date.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {data && <ForwardBesideReplay forward={data.forwardByVersion} />}
    </div>
  );
}

function DatePicker({
  label,
  dates,
  value,
  onChange,
}: {
  label: string;
  dates: string[];
  value: string | null;
  onChange: (date: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {formatSession(d)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DirectionList({
  title,
  rows,
  earlier,
  later,
  exact,
}: {
  title: string;
  rows: PastScanCompared[];
  earlier: string;
  later: string;
  exact: boolean;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-background/50 px-3 py-2 text-xs font-medium text-muted">
        {title} · {formatSession(earlier)} against {formatSession(later)}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted">Nothing published on either day.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <ComparedRow key={`${r.symbol}-${r.direction}`} row={r} earlier={earlier} later={later} exact={exact} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComparedRow({
  row,
  earlier,
  later,
  exact,
}: {
  row: PastScanCompared;
  earlier: string;
  later: string;
  exact: boolean;
}) {
  const change = CHANGE_LABELS[row.change];
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={tickerHref(row.symbol)} className="font-medium text-accent hover:underline">
          {row.symbol}
        </Link>
        {change && <Badge variant={change.variant}>{change.label}</Badge>}
        {row.executeOn && <Badge variant="bull">Execute on {formatSession(row.executeOn)}</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DayCell date={earlier} row={row.earlier} forward={row.earlierForward} exact={exact} />
        <DayCell date={later} row={row.later} forward={row.laterForward} exact={exact} />
      </div>
    </div>
  );
}

function DayCell({
  date,
  row,
  forward,
  exact,
}: {
  date: string;
  row: PastScanRow | null;
  forward: ForwardTestRow | null;
  exact: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md bg-background/50 px-2 py-1.5">
      <span className="text-xs text-muted">{formatSession(date)}</span>
      {row ? (
        <>
          <ScoreBadge score={row.score} state={row.state} exactScoreDisplayEnabled={exact} />
          {row.entry != null && (
            <span className="text-xs text-muted">
              Entry {formatUsd(row.entry)}
              {row.stopLoss != null && ` · Stop ${formatUsd(row.stopLoss)}`}
              {row.takeProfit1 != null && ` · TP1 ${formatUsd(row.takeProfit1)}`}
              {row.masterProfit != null && ` · MTP ${formatUsd(row.masterProfit)}`}
            </span>
          )}
          {row.state === "Execute" && <ForwardLine forward={forward} />}
        </>
      ) : (
        <span className="text-xs text-muted">Not on the list</span>
      )}
    </div>
  );
}

function ForwardLine({ forward }: { forward: ForwardTestRow | null }) {
  if (!forward) return <span className="text-xs text-muted">Forward test: not recorded</span>;
  if (forward.outcome === null) return <span className="text-xs text-muted">Forward test: still open</span>;
  if (walkedOnEarlierRules(forward)) {
    return <span className="text-xs text-muted">Forward test: walked on the earlier entry rule, not counted</span>;
  }
  const filled = forward.outcome === "win" || forward.outcome === "loss" || forward.outcome === "timeout";
  return (
    <span className="text-xs">
      <span className="text-muted">Forward test: </span>
      {OUTCOME_LABELS[forward.outcome]}
      {filled && forward.rMultiple != null && (
        <span className={forward.rMultiple >= 0 ? "text-bull" : "text-bear"}> {formatR(forward.rMultiple)}</span>
      )}
      {filled && forward.barsHeld != null && (
        <span className="text-muted">
          {" "}
          over {forward.barsHeld} session{forward.barsHeld === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

/**
 * The forward test by strategy version, each beside the committed replay of
 * production's rules on the same version where one exists. Versions measure
 * different rules, so nothing is pooled across them (R-032).
 */
function ForwardBesideReplay({ forward }: { forward: ForwardTestByVersion[] | null }) {
  const latest = latestProductionReplay();
  const replayFor = (version: string): ReplayReference | null =>
    PRODUCTION_REPLAY_RUNS.find((r) => r.strategyVersion === version) ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forward test beside the replay</CardTitle>
        <CardDescription>
          The forward test walks each live Execute call after it is made; the replay walks the same rules over past
          bars. Each line is one version of the rules, since a change of rules starts a new record.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {forward === null && <p className="text-sm text-bear">The forward test could not be read just now.</p>}
        {forward && forward.length === 0 && <p className="text-sm text-muted">No forward-test calls recorded yet.</p>}
        {forward && forward.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {forward.map((v) => {
              const replay = replayFor(v.strategyVersion);
              return (
                <div key={v.strategyVersion} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="break-all font-mono text-xs">{v.strategyVersion}</span>
                    <span className="text-xs text-muted">
                      {formatSession(v.firstSession)}
                      {v.lastSession !== v.firstSession && ` to ${formatSession(v.lastSession)}`}
                    </span>
                  </div>
                  <span>
                    <span className="text-muted">Forward test: </span>
                    {v.trades} trade{v.trades === 1 ? "" : "s"}
                    {v.trades > 0 && `, ${v.wins} won`}
                    {v.meanR != null && (
                      <span className={v.meanR >= 0 ? "text-bull" : "text-bear"}>, mean {formatR(v.meanR)}</span>
                    )}
                    {v.notFilled > 0 && <span className="text-muted">; {v.notFilled} never filled</span>}
                    {v.pending > 0 && <span className="text-muted">; {v.pending} still open</span>}
                    {v.earlierRules > 0 && (
                      <span className="text-muted">
                        ; {v.earlierRules} walked on the earlier entry rule and left out
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="text-muted">Replay: </span>
                    {replay ? <ReplayFigures replay={replay} /> : "none committed on this version"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {latest && (
          <p className="text-xs text-muted">
            Latest committed replay of production&apos;s rules: {latest.symbols} symbols on {latest.timeframe} bars,{" "}
            {formatSession(latest.window.from)} to {formatSession(latest.window.to)}, version{" "}
            <span className="break-all font-mono">{latest.strategyVersion}</span>. Execute <ReplayFigures replay={latest} />.
            A handful of forward-test trades is too few to judge a rule by; the record grows each session.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReplayFigures({ replay }: { replay: ReplayReference }) {
  const e = replay.execute;
  return (
    <span>
      {e.trades} Execute trades, {formatPct(e.winRate)} won, mean {formatR(e.expectancyR)} (95% range {formatR(e.ci95[0])}{" "}
      to {formatR(e.ci95[1])})
    </span>
  );
}
