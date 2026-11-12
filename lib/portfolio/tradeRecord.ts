/**
 * The member's own record, read back: runs of winning and losing trades, and
 * where the pause after a series of losses fell (Q3 plan item 2).
 *
 * The method: keep a record of your own trades and read it back, because a
 * trader has good and bad runs of his own, and after two or three losses in a
 * row stop and rest before going on (ref: SRC-003 pp. 34-38; ref: SRC-002;
 * the same rule `lib/risk/lossSeries.ts` enforces). The pause already reads
 * this record on every entry path; this module lets the member read it too.
 *
 * Correspondence with the pause: the record reads exactly the trades the pause
 * reads (closed paper and live trades, never hand-typed journal entries, which
 * are unchecked), counts a series the same way (`LOSS_SERIES_LENGTH` in a row,
 * by each trade's recorded outcome), honours an operator's reset the same way
 * (a series in progress starts afresh at it; pauses before it stand, since
 * they were applied), and dates the pause on the
 * same trading calendar (`tradingDayAfter`). So the record can't show a pause
 * the rule didn't apply, or miss one it did.
 *
 * It makes no claim about GSPS's signals: no win rate or expectancy, only the
 * member's own runs.
 *
 * Three-question basis:
 * 1. Method: as cited above (Tier A).
 * 2. Cycles: the trader's "good and bad cycles" are read as runs in sequence,
 *    not as a period. No periodicity is claimed, so the seven-item checklist
 *    is not run; nothing here projects a run forward.
 * 3. Hermetic: Rhythm (the swing between good and bad runs is shown as it
 *    happened) and Cause and Effect (each pause sits beside the losses that
 *    caused it, with the member's own notes on them). Polarity was weighed and
 *    set aside: the record shows wins and losses side by side, but it does not
 *    pair them into a third reading.
 */

import { etDateKey } from "@/lib/market/session";
import { LOSS_SERIES_LENGTH, tradingDayAfter } from "@/lib/risk/lossSeries";

export interface RecordTrade {
  id: string;
  symbol: string | null;
  outcome: "profit" | "loss";
  exitTimestamp: string;
  profitLossDollars: number | null;
}

export interface TradeRun {
  kind: "win" | "loss";
  length: number;
  /** ET date of the run's first and last trade. */
  from: string;
  to: string;
  /** Sum of the run's realized dollars (trades with no figure count as 0). */
  net: number;
}

export interface PauseMark {
  /** ET date of the loss that completed the series. */
  startedOn: string;
  /** ET date of the run's last loss; each further loss moved the pause on. */
  lastLossOn: string;
  /**
   * ET date new entries could resume: the second trading day after the last
   * loss, or sooner when a win or an operator's reset ended the series first.
   */
  resumesOn: string;
  /** Losses in the run. */
  losses: number;
  /** The trade that completed the series. */
  tradeId: string;
}

export interface TradeRecordReading {
  closed: number;
  wins: number;
  losses: number;
  longestWinRun: number;
  longestLossRun: number;
  /** The run the newest trade belongs to. */
  current: TradeRun | null;
  /** Every run, newest first. */
  runs: TradeRun[];
  /** Every pause, newest first. */
  pauses: PauseMark[];
}

function finiteOr0(n: number | null): number {
  return n != null && Number.isFinite(n) ? n : 0;
}

/**
 * Read the record from closed trades in any order. Pure. `resetAt` is the
 * operator's loss-series reset (migration 0141), when there is one.
 */
export function readTradeRecord(trades: readonly RecordTrade[], resetAt: string | null = null): TradeRecordReading {
  const valid = trades.filter((t) => (t.outcome === "profit" || t.outcome === "loss") && Number.isFinite(Date.parse(t.exitTimestamp)));
  // Oldest first; ties broken by id so the reading is deterministic.
  const ordered = [...valid].sort((a, b) => Date.parse(a.exitTimestamp) - Date.parse(b.exitTimestamp) || a.id.localeCompare(b.id));
  const resetMs = resetAt != null && Number.isFinite(Date.parse(resetAt)) ? Date.parse(resetAt) : null;

  const runs: TradeRun[] = [];
  const pauses: PauseMark[] = [];
  let run: TradeRun | null = null;
  let pause: PauseMark | null = null;
  // Losses counted toward a series. Separate from the run's length because a
  // reset starts the series afresh without changing what the trades were.
  let seriesLosses = 0;
  let prevMs: number | null = null;

  for (const t of ordered) {
    const ms = Date.parse(t.exitTimestamp);
    const day = etDateKey(new Date(ms));
    const kind = t.outcome === "profit" ? "win" : "loss";
    const crossedReset = resetMs != null && ms > resetMs && (prevMs == null || prevMs <= resetMs);

    if (!run || run.kind !== kind) {
      run = { kind, length: 0, from: day, to: day, net: 0 };
      runs.push(run);
    }
    run.length++;
    run.to = day;
    run.net += finiteOr0(t.profitLossDollars);

    // The live rule reads the newest trade first: a win closed during a pause
    // (a position already open) ends the series, and the pause with it, and
    // so does an operator's reset. The record dates the end the same way.
    if (crossedReset && pause && resetMs != null) {
      const resetDay = etDateKey(new Date(resetMs));
      if (resetDay < pause.resumesOn) pause.resumesOn = resetDay;
    }
    if (kind === "win") {
      if (pause && day < pause.resumesOn) pause.resumesOn = day;
      seriesLosses = 0;
      pause = null;
    } else {
      if (crossedReset) {
        seriesLosses = 0;
        pause = null;
      }
      seriesLosses++;
      if (seriesLosses >= LOSS_SERIES_LENGTH) {
        if (!pause) {
          pause = { startedOn: day, lastLossOn: day, resumesOn: tradingDayAfter(day, 2), losses: seriesLosses, tradeId: t.id };
          pauses.push(pause);
        } else {
          pause.lastLossOn = day;
          pause.resumesOn = tradingDayAfter(day, 2);
          pause.losses = seriesLosses;
        }
      }
    }
    prevMs = ms;
  }
  // A reset after the newest trade ends a pause still open.
  if (pause && resetMs != null && prevMs != null && resetMs >= prevMs) {
    const resetDay = etDateKey(new Date(resetMs));
    if (resetDay < pause.resumesOn) pause.resumesOn = resetDay;
  }

  const wins = ordered.filter((t) => t.outcome === "profit").length;
  return {
    closed: ordered.length,
    wins,
    losses: ordered.length - wins,
    longestWinRun: Math.max(0, ...runs.filter((r) => r.kind === "win").map((r) => r.length)),
    longestLossRun: Math.max(0, ...runs.filter((r) => r.kind === "loss").map((r) => r.length)),
    current: runs.length ? { ...runs[runs.length - 1] } : null,
    runs: runs.map((r) => ({ ...r })).reverse(),
    pauses: pauses.map((p) => ({ ...p })).reverse(),
  };
}

/** The longest a note may be; the column's check in migration 0151 matches. */
export const TRADE_NOTE_MAX = 2000;

/** A note as stored: trimmed, or null when there is nothing left to keep. */
export function cleanTradeNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  return trimmed.length ? trimmed : null;
}
