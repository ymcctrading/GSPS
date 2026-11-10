"use client";

/**
 * The live record of every Execute call, by session, with what became of it,
 * losses and non-fills included (`GET /api/shadow/daily`). The route answers
 * the owner's accounts only, so for anyone else this renders nothing.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ShadowCallState, ShadowDay, ShadowTotals } from "@/lib/shadow/daily";

interface RecordResponse {
  days: number;
  since: string;
  currentVersion: string;
  totals: ShadowTotals;
  record: ShadowDay[];
}

const STATE_LABEL: Record<ShadowCallState, string> = {
  win: "Won",
  loss: "Lost",
  timeout: "Out at the time limit",
  held: "Filled, still open",
  expired: "Never filled",
  retired: "Stop broke first",
  unread: "Not read yet",
};

const rText = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`);
const tone = (n: number | null) => (n == null || n === 0 ? "text-muted" : n > 0 ? "text-bull" : "text-bear");
const price = (n: number | null) => (n == null ? "—" : n.toFixed(n < 1 ? 4 : 2));

export function ForwardRecord() {
  const [data, setData] = useState<RecordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shadow/daily?days=${days}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setHidden(true);
          return;
        }
        setHidden(false);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setError(null);
        setData(body as RecordResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (hidden) return null;
  const t = data?.totals;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live record (private)</CardTitle>
        <CardDescription>
          Every Execute call, by the session it trades, and what became of it: filled on the
          reaction and won, lost or ran out of time, still open, never filled, or called off by its
          stop first. Fills and exits are read on the 15-minute delayed feed. Visible to your
          accounts only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[30, 90, 180].map((d) => (
            <Button key={d} variant={d === days ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d} days
            </Button>
          ))}
        </div>
        {error && <p className="text-sm text-bear">{error}</p>}
        {t && (
          <p className="text-sm">
            {t.calls} calls ({t.plans} distinct plans) since {data.since}: {t.decided} decided ({t.wins} won, {t.losses} lost,{" "}
            {t.timeouts} out at the time limit), {t.held} still open, {t.expired} never filled,{" "}
            {t.retired} called off by the stop, {t.unread} not read yet. Total{" "}
            <span className={tone(t.decided ? t.totalR : null)}>{t.decided ? rText(t.totalR) : "—"}</span>, average{" "}
            <span className={tone(t.averageR)}>{rText(t.averageR)}</span>
            {t.winRate != null && `, ${(t.winRate * 100).toFixed(0)}% won`}. Rules now in use:{" "}
            {data.currentVersion}.
          </p>
        )}
        {t && <GoodCallLine g={t.goodCalls} />}
        {data && data.record.length === 0 && <p className="text-sm text-muted">No calls in this window.</p>}
        {data && data.record.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Session</TH>
                  <TH className="text-right">Calls</TH>
                  <TH className="text-right">Filled</TH>
                  <TH className="text-right">Won / lost / time</TH>
                  <TH className="text-right">Open</TH>
                  <TH className="text-right">Never filled</TH>
                  <TH className="text-right">Stop first</TH>
                  <TH className="text-right">Not read</TH>
                  <TH className="text-right">Total R</TH>
                </TR>
              </THead>
              <TBody>
                {data.record.map((day) => (
                  <DayRows key={day.session} day={day} open={open === day.session} toggle={() => setOpen(open === day.session ? null : day.session)} />
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CALL_LABEL = { good: "good call", bad: "bad call", open: "call open", no_fill: "no fill" } as const;

/**
 * The owner's scoring (2026-11-10): from the fill, TP1 before the stop is a
 * good call, the stop first a bad one; no-fills apart. Shown beside the rate
 * the cards need to break even, so a high rate on close targets can't pass
 * for a profitable one.
 */
function GoodCallLine({ g }: { g: ShadowTotals["goodCalls"] }) {
  if (g.calls === 0) return <p className="text-sm text-muted">No card has a first target recorded in this window yet.</p>;
  const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
  const ahead = g.goodRate != null && g.breakEven != null ? g.goodRate - g.breakEven : null;
  return (
    <p className="text-sm">
      Calls: {g.good} good, {g.bad} bad, {g.open} still open, {g.noFill} never filled. Good-call rate {pct(g.goodRate)} against{" "}
      {pct(g.breakEven)} needed to break even
      {ahead != null && (
        <span className={tone(ahead)}>
          {" "}
          ({ahead >= 0 ? "+" : ""}
          {(ahead * 100).toFixed(0)} points)
        </span>
      )}
      , <span className={tone(g.expectancyR)}>{rText(g.expectancyR)}</span> a decided call to TP1 or the stop.
    </p>
  );
}

function DayRows({ day, open, toggle }: { day: ShadowDay; open: boolean; toggle: () => void }) {
  const decided = day.wins + day.losses + day.timeouts;
  return (
    <>
      <TR className="cursor-pointer" onClick={toggle}>
        <TD className="font-medium">
          {open ? "▾" : "▸"} {day.session}
        </TD>
        <TD className="text-right tabular-nums">{day.calls}</TD>
        <TD className="text-right tabular-nums">{day.filled}</TD>
        <TD className="text-right tabular-nums">
          {day.wins} / {day.losses} / {day.timeouts}
        </TD>
        <TD className="text-right tabular-nums">{day.held}</TD>
        <TD className="text-right tabular-nums">{day.expired}</TD>
        <TD className="text-right tabular-nums">{day.retired}</TD>
        <TD className="text-right tabular-nums">{day.unread}</TD>
        <TD className={cn("text-right tabular-nums", tone(decided ? day.totalR : null))}>{decided ? rText(day.totalR) : "—"}</TD>
      </TR>
      {open &&
        day.items.map((c, i) => (
          <TR key={`${c.symbol}-${c.scannedAt}-${i}`} className="text-xs text-muted">
            <TD>
              {c.symbol} {c.side === "long" ? "buy" : "sell"}
              {c.score != null && ` · ${c.score}/9`}
            </TD>
            <TD className="text-right tabular-nums" colSpan={2}>
              entry {price(c.entry)} · stop {price(c.stop)}
              {c.tp1 != null && ` · TP1 ${price(c.tp1)}`}
            </TD>
            <TD className="text-right tabular-nums" colSpan={2}>
              fill {price(c.fill)}
            </TD>
            <TD className="text-right" colSpan={2}>
              {STATE_LABEL[c.state]}
              {c.call != null && ` · ${CALL_LABEL[c.call]}`}
              {c.sessionsHeld != null && ` · ${c.sessionsHeld} session${c.sessionsHeld === 1 ? "" : "s"}`}
            </TD>
            <TD className="text-right">{c.version}</TD>
            <TD className={cn("text-right tabular-nums", tone(c.r))}>{rText(c.r)}</TD>
          </TR>
        ))}
    </>
  );
}
