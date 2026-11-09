/**
 * Gann's rule for a series of losses (parity roadmap E1, gap G16).
 *
 * Gann: after two or three losses in a row, stop trading and study before
 * going on; the market has changed or your judgment has, and pressing on is
 * how a series becomes a ruin (*How to Make Profits in Commodities* pp. 12,
 * 17, 29; *Truth of the Stock Tape*; *Wall Street Stock Selector* Ch. III.
 * All Tier A). He also cuts the trading unit to a tenth of what capital is
 * left. That half is met by Gann's capital rules: a trade risks at most a
 * tenth of the trading unit, and the unit is never above the equity left
 * (`lib/risk/gannCapital.ts`, A-RISK-03), so a loss shrinks the next trade's
 * risk on its own and is not repeated here.
 *
 * This module adds the other half, on every path that places an entry (paper
 * and live, manual, Guided, demo and automation), through
 * `lib/trade/place-order.ts`. Before this, the only loss rule was the live
 * account's percentage circuit breaker (`lib/risk/circuit-breaker.ts`), so a
 * paper account had no stop-after-losses rule at all.
 *
 * Engineering choices, labelled as such:
 * - "A series" is three consecutive closed losing trades, the upper end of
 *   Gann's 2-3, so a single unlucky pair never stops a trader.
 * - "Stop and study" is a pause on new entries for the rest of the ET
 *   trading day of the third loss and the next day. Gann names no length.
 *   Protective orders (stops, closes, reductions) are never blocked, the same
 *   rule `lib/risk/cooldown.ts` encodes.
 * - An operator's reset (`loss_series_resets`, migration 0141, owner's word
 *   only) starts the series afresh from its time; no trade is removed.
 * - The count reads `trade_logs`' paper and live closes; a series is a series
 *   whichever account it happened in. Journal entries (typed by hand, never
 *   checked) are left out, since a typed win would end a series (R-002).
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. A run of losses is an effect whose cause
 *    (a changed market, or a changed trader) has to be found before the next
 *    trade, and the pause is the time to find it. Mentalism fits too: Gann
 *    places the danger in the trader's state of mind after losses (hope and
 *    fear), which is why the rule stops the trader rather than the market.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { isMarketHoliday } from "@/lib/market/calendar";

/** Consecutive closed losing trades that start a pause. */
export const LOSS_SERIES_LENGTH = 3;

export interface ClosedTrade {
  outcome: "profit" | "loss" | "pending" | null;
  exitTimestamp: string | null;
  symbol?: string | null;
  profitLossDollars?: number | null;
}

/** One loss of the series, newest first, so a trader can check the count. */
export interface SeriesTrade {
  symbol: string | null;
  exitTimestamp: string | null;
  profitLossDollars: number | null;
}

export interface LossSeriesReading {
  consecutiveLosses: number;
  /** ET date of the loss that completed the series, when there is one. */
  seriesCompletedOn: string | null;
  /** The losses read, newest first (at most `LOSS_SERIES_LENGTH`). */
  losses: SeriesTrade[];
  /** ET date (YYYY-MM-DD) new entries may resume, while paused. */
  resumesOn: string | null;
  paused: boolean;
  note: string | null;
}

/**
 * Trading days after `from` (both YYYY-MM-DD, ET), weekends and full-day
 * market holidays skipped, so a pause across a holiday still covers the next
 * session the trader could trade (review finding R-002).
 */
function tradingDaysAfter(from: string, to: string): number {
  let count = 0;
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !isMarketHoliday(d.toISOString().slice(0, 10))) count++;
  }
  return count;
}

/** The trading day `n` trading days after `from` (YYYY-MM-DD, ET). */
function tradingDayAfter(from: string, n: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !isMarketHoliday(d.toISOString().slice(0, 10))) left--;
  }
  return d.toISOString().slice(0, 10);
}

function shortDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function describeLoss(t: SeriesTrade): string {
  const when = t.exitTimestamp ? shortDate(etDateKey(new Date(t.exitTimestamp))).replace(/^\w+, /, "") : "date unknown";
  const pnl = t.profitLossDollars != null && Number.isFinite(t.profitLossDollars)
    ? `, ${t.profitLossDollars < 0 ? "-" : ""}$${Math.abs(t.profitLossDollars).toFixed(2)}`
    : "";
  return `${t.symbol ?? "a trade"} ${when}${pnl}`;
}

/**
 * Read the series from closed trades, newest first. Pure, so it can be tested
 * without a database.
 */
export function readLossSeries(closedNewestFirst: ClosedTrade[], now: Date = new Date()): LossSeriesReading {
  let consecutiveLosses = 0;
  let seriesCompletedOn: string | null = null;
  const losses: SeriesTrade[] = [];
  for (const t of closedNewestFirst) {
    if (t.outcome !== "loss") break;
    consecutiveLosses++;
    if (losses.length < LOSS_SERIES_LENGTH) {
      losses.push({ symbol: t.symbol ?? null, exitTimestamp: t.exitTimestamp, profitLossDollars: t.profitLossDollars ?? null });
    }
    if (consecutiveLosses === 1 && t.exitTimestamp) seriesCompletedOn = etDateKey(new Date(t.exitTimestamp));
  }
  if (consecutiveLosses < LOSS_SERIES_LENGTH || !seriesCompletedOn) {
    return { consecutiveLosses, seriesCompletedOn: null, losses, resumesOn: null, paused: false, note: null };
  }
  const elapsed = tradingDaysAfter(seriesCompletedOn, etDateKey(now));
  const paused = elapsed <= 1;
  // The pause covers the third loss's day and the next trading day, so
  // entries resume on the second trading day after it.
  const resumesOn = paused ? tradingDayAfter(seriesCompletedOn, 2) : null;
  return {
    consecutiveLosses,
    seriesCompletedOn,
    losses,
    resumesOn,
    paused,
    note: paused && resumesOn
      ? `${consecutiveLosses} losing trades in a row, the latest: ${losses.map(describeLoss).join("; ")}. New entries resume ${shortDate(resumesOn)}: stop, review what changed, then go on. Stops and closes are never blocked.`
      : null,
  };
}

async function readLossSeriesReset(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("loss_series_resets")
      .select("reset_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return (data as { reset_at?: string } | null)?.reset_at ?? null;
  } catch {
    return null;
  }
}

/** Load the user's most recent closed trades and read the series. */
export async function readUserLossSeries(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<LossSeriesReading> {
  // An operator's reset (migration 0141) starts the series afresh: losses
  // closed at or before it no longer count. Unreadable reads as no reset, so
  // the pause errs toward holding.
  const resetAt = await readLossSeriesReset(supabase, userId);
  let query = supabase
    .from("trade_logs")
    .select("outcome, exit_timestamp, symbol, profit_loss_dollars")
    .eq("user_id", userId)
    // Trades GSPS placed, paper or live. A journal entry is typed by hand and
    // unchecked, and one "profit" dated now would end a series (R-002).
    .in("mode", ["paper", "live"])
    .in("outcome", ["profit", "loss"])
    .not("exit_timestamp", "is", null);
  if (resetAt) query = query.gt("exit_timestamp", resetAt);
  const { data, error } = await query.order("exit_timestamp", { ascending: false }).limit(10);
  if (error) throw new Error(`loss series: ${error.message}`);
  const rows = (data ?? []) as {
    outcome: ClosedTrade["outcome"];
    exit_timestamp: string | null;
    symbol: string | null;
    profit_loss_dollars: number | string | null;
  }[];
  return readLossSeries(
    rows.map((r) => ({
      outcome: r.outcome,
      exitTimestamp: r.exit_timestamp,
      symbol: r.symbol,
      profitLossDollars: r.profit_loss_dollars == null ? null : Number(r.profit_loss_dollars),
    })),
    now,
  );
}
