/**
 * Gann's rule for a series of losses (parity roadmap E1, gap G16).
 *
 * Gann: after two or three losses in a row, stop trading and study before
 * going on; the market has changed or your judgment has, and pressing on is
 * how a series becomes a ruin (*How to Make Profits in Commodities* pp. 12,
 * 17, 29; *Truth of the Stock Tape*; *Wall Street Stock Selector* Ch. III.
 * All Tier A). He also cuts the trading unit to a tenth of what capital is
 * left. GSPS already sizes every trade as a percentage of current equity, so
 * a loss shrinks the next unit on its own; that half of the rule is met
 * structurally and is not repeated here.
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
 * - The count reads `trade_logs`, which carries both paper and live closes;
 *   a series is a series whichever account it happened in.
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

/** Consecutive closed losing trades that start a pause. */
export const LOSS_SERIES_LENGTH = 3;

export interface ClosedTrade {
  outcome: "profit" | "loss" | "pending" | null;
  exitTimestamp: string | null;
}

export interface LossSeriesReading {
  consecutiveLosses: number;
  /** ET date of the loss that completed the series, when there is one. */
  seriesCompletedOn: string | null;
  paused: boolean;
  note: string | null;
}

/** Trading days after `from` (both YYYY-MM-DD, ET), weekends skipped. Holidays are not modelled. */
function tradingDaysAfter(from: string, to: string): number {
  let count = 0;
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

/**
 * Read the series from closed trades, newest first. Pure, so it can be tested
 * without a database.
 */
export function readLossSeries(closedNewestFirst: ClosedTrade[], now: Date = new Date()): LossSeriesReading {
  let consecutiveLosses = 0;
  let seriesCompletedOn: string | null = null;
  for (const t of closedNewestFirst) {
    if (t.outcome !== "loss") break;
    consecutiveLosses++;
    if (consecutiveLosses === 1 && t.exitTimestamp) seriesCompletedOn = etDateKey(new Date(t.exitTimestamp));
  }
  if (consecutiveLosses < LOSS_SERIES_LENGTH || !seriesCompletedOn) {
    return { consecutiveLosses, seriesCompletedOn: null, paused: false, note: null };
  }
  const elapsed = tradingDaysAfter(seriesCompletedOn, etDateKey(now));
  const paused = elapsed <= 1;
  return {
    consecutiveLosses,
    seriesCompletedOn,
    paused,
    note: paused
      ? `${consecutiveLosses} losing trades in a row. New entries pause for the rest of today and the next trading day: stop, review what changed, then go on. Stops and closes are never blocked.`
      : null,
  };
}

/** Load the user's most recent closed trades and read the series. */
export async function readUserLossSeries(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<LossSeriesReading> {
  const { data, error } = await supabase
    .from("trade_logs")
    .select("outcome, exit_timestamp")
    .eq("user_id", userId)
    .in("outcome", ["profit", "loss"])
    .not("exit_timestamp", "is", null)
    .order("exit_timestamp", { ascending: false })
    .limit(10);
  if (error) throw new Error(`loss series: ${error.message}`);
  const rows = (data ?? []) as { outcome: ClosedTrade["outcome"]; exit_timestamp: string | null }[];
  return readLossSeries(rows.map((r) => ({ outcome: r.outcome, exitTimestamp: r.exit_timestamp })), now);
}
