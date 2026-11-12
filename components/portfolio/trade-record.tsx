"use client";

/**
 * Your record: the member's own closed trades read back, with their winning
 * and losing runs, where the pause after three losses in a row fell, and a
 * note of their own on any trade (Q3 plan item 2).
 *
 * Reads `/api/trade-record` (the trades the pause itself reads, through
 * `lib/portfolio/tradeRecord.ts`) and writes notes through `/api/trade-notes`.
 * It states no win rate or expectancy: the record is the member's, and makes
 * no claim about GSPS's signals.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, PauseCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatUsd } from "@/lib/utils";
import type { TradeRecordReading, TradeRun } from "@/lib/portfolio/tradeRecord";

const NOTE_MAX = 2000;

interface RecordRow {
  id: string;
  symbol: string | null;
  direction: "buy" | "sell";
  quantity: number | null;
  entryPrice: number | null;
  exitTimestamp: string;
  exitPrice: number | null;
  outcome: "profit" | "loss";
  profitLossDollars: number | null;
  exitCondition: string | null;
  account: "paper" | "live";
  startedPause: boolean;
  note: string | null;
}

interface RecordResponse {
  record: TradeRecordReading;
  total: number;
  trades: RecordRow[];
}

const EXIT_LABEL: Record<string, string> = {
  tp1: "TP1",
  master_target: "MTP",
  stop_loss: "Stop",
  manual: "Closed by you",
};

/** "Nov 11" from an ET date key (YYYY-MM-DD). */
function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function closedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function runLabel(run: TradeRun): string {
  const what = run.kind === "win" ? (run.length === 1 ? "win" : "wins") : run.length === 1 ? "loss" : "losses";
  const when = run.from === run.to ? dayLabel(run.from) : `${dayLabel(run.from)} to ${dayLabel(run.to)}`;
  return `${run.length} ${what}, ${when}`;
}

export function TradeRecord() {
  const [data, setData] = useState<RecordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    let live = true;
    fetch(`/api/trade-record?limit=${limit}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (live) setData(body as RecordResponse);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [limit]);

  const onSaved = useCallback((id: string, note: string | null) => {
    setData((d) => (d ? { ...d, trades: d.trades.map((t) => (t.id === id ? { ...t, note } : t)) } : d));
  }, []);

  const record = data?.record ?? null;
  const count = record?.closed ?? 0;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer flex-col gap-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            )}
            <CardTitle>Your record ({count})</CardTitle>
          </div>
          <CardDescription>
            Your closed trades in order: your winning and losing runs, where the pause after three losses in
            a row fell, and your own note on any trade. Read it back to find your good and bad stretches.
            It is your record only, not a measure of GSPS&apos;s signals.
          </CardDescription>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-bear">{error}</p>}
          {!error && !data && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
          {!error && record && record.closed === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No closed trades yet. Your record starts with your first closed paper or live trade.
            </p>
          )}
          {!error && record && record.closed > 0 && data && (
            <>
              <RecordSummary record={record} />
              <div className="flex flex-col gap-2">
                {data.trades.map((t) => (
                  <TradeLine key={t.id} trade={t} onSaved={onSaved} />
                ))}
              </div>
              {data.trades.length < data.total && limit < 200 && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => setLimit(200)}>
                  Show more trades
                </Button>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Today's New York date (YYYY-MM-DD). */
function todayEt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function RecordSummary({ record }: { record: TradeRecordReading }) {
  const today = todayEt();
  const recentRuns = record.runs.slice(0, 8);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Closed" value={String(record.closed)} />
        <Fact label="Wins / losses" value={`${record.wins} / ${record.losses}`} />
        <Fact label="Longest winning run" value={String(record.longestWinRun)} />
        <Fact label="Longest losing run" value={String(record.longestLossRun)} />
      </div>
      {record.current && (
        <p className="text-sm">
          Now: <span className={record.current.kind === "win" ? "text-bull" : "text-bear"}>{runLabel(record.current)}</span>
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Runs, newest first</span>
        <div className="flex flex-wrap gap-1.5">
          {recentRuns.map((r) => (
            <Badge key={`${r.kind}-${r.from}-${r.to}-${r.length}`} variant="muted" className={r.kind === "win" ? "text-bull" : "text-bear"}>
              {runLabel(r)} ({r.net < 0 ? "-" : ""}
              {formatUsd(Math.abs(r.net))})
            </Badge>
          ))}
        </div>
      </div>
      {record.pauses.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Pauses after a losing run</span>
          {record.pauses.slice(0, 6).map((p) => (
            <p key={p.tradeId} className="flex items-center gap-1.5 text-sm">
              <PauseCircle className="size-4 shrink-0 text-muted" aria-hidden />
              {p.losses} losses in a row; paused from {dayLabel(p.startedOn)},{" "}
              {p.resumesOn > today ? "entries resume" : "entries resumed"} {dayLabel(p.resumesOn)}.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TradeLine({ trade, onSaved }: { trade: RecordRow; onSaved: (id: string, note: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trade.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pl = trade.profitLossDollars;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/trade-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeLogId: trade.id, note: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onSaved(trade.id, body.note ?? null);
      setDraft(body.note ?? "");
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("rounded-md border border-border p-3", trade.startedPause && "border-bear/50")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{trade.symbol ?? "—"}</span>
        <Badge variant="muted">{trade.direction === "buy" ? "Long" : "Short"}</Badge>
        {trade.account === "live" && <Badge variant="muted">Live</Badge>}
        <span className="text-muted">{closedLabel(trade.exitTimestamp)}</span>
        {trade.exitCondition && EXIT_LABEL[trade.exitCondition] && (
          <span className="text-muted">· {EXIT_LABEL[trade.exitCondition]}</span>
        )}
        <span className={cn("ml-auto tabular-nums", trade.outcome === "profit" ? "text-bull" : "text-bear")}>
          {pl == null ? (trade.outcome === "profit" ? "Gain" : "Loss") : `${pl < 0 ? "-" : "+"}${formatUsd(Math.abs(pl))}`}
        </span>
      </div>
      {trade.startedPause && (
        <p className="mt-1 text-xs text-bear">This loss made three in a row and started a pause on new entries.</p>
      )}
      {!editing && trade.note && <p className="mt-2 whitespace-pre-wrap text-sm">{trade.note}</p>}
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <label className="sr-only" htmlFor={`note-${trade.id}`}>
            Your note on this trade
          </label>
          <textarea
            id={`note-${trade.id}`}
            value={draft}
            maxLength={NOTE_MAX}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What you saw, why you took it, what you would do the same or differently."
            className="w-full rounded-md border border-border bg-transparent p-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save note"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(trade.note ?? "");
                setEditing(false);
                setSaveError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <span className="ml-auto text-xs text-muted">
              {draft.length}/{NOTE_MAX}
            </span>
          </div>
          {saveError && <p className="text-xs text-bear">{saveError}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs text-accent hover:underline">
          {trade.note ? "Edit note" : "Add a note"}
        </button>
      )}
    </div>
  );
}
