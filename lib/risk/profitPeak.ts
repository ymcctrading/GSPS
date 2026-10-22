/**
 * What A-RISK-07's tenth of the profits is read on (*Tunnel Thru the Air*,
 * W022 pp.198-199, Tier A): the account's starting capital and the most profit
 * it has banked. Once profits have reached the starting capital, every later
 * trade risks at most a tenth of the profits that remain, so after a loss the
 * next one is smaller at once (`profitRiskCeiling`).
 *
 * - Paper: the starting capital is `STARTING_CASH`, and the peak is the highest
 *   running total of the paper account's own closed P&L in `trade_logs`
 *   (`mode = 'paper'`, migration 0107). Gann reads the tenth on the capital
 *   that made the profits, so live and journal closes are not in it (review
 *   finding R-002). `lossSeries.ts` and `readWinningRun` read every close,
 *   because they are rules about the trader, not about one account.
 * - Live: the starting capital is the first verified equity read from the
 *   broker (`risk_live_equity_snapshots`, written by `lib/risk/service.ts`), and
 *   the peak is the highest verified equity since. Engineering choice, labelled:
 *   until net deposits are read from the broker, money added or withdrawn after
 *   that first read counts as profit or loss.
 *
 * Unreadable data gives null, and the tenth of the trading unit governs alone.
 *
 * Three-question basis: 1. Gann, as cited. 2. Cycles: no periodicity claim.
 * 3. Hermetic: Cause and Effect, banked profit is the cause the next risk is
 * drawn from, and a loss shrinks it at once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STARTING_CASH } from "@/lib/brokers/simulator";
import { profitRiskCeiling } from "@/lib/risk/gannCapital";

/** The highest running total of a series of closed P&L, never below zero. */
export function peakRunningTotal(pnls: readonly number[]): number {
  let total = 0;
  let peak = 0;
  for (const p of pnls) {
    total += Number.isFinite(p) ? p : 0;
    peak = Math.max(peak, total);
  }
  return peak;
}

async function readPaperPeakProfits(supabase: SupabaseClient, userId: string): Promise<number | null> {
  try {
    const res = await supabase
      .from("trade_logs")
      .select("profit_loss_dollars, exit_timestamp")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .not("exit_timestamp", "is", null)
      .order("exit_timestamp", { ascending: true })
      .limit(5000);
    if (res.error) return null;
    return peakRunningTotal(((res.data ?? []) as { profit_loss_dollars: number | null }[]).map((r) => Number(r.profit_loss_dollars ?? 0)));
  } catch {
    return null;
  }
}

async function readLiveCapitalRecord(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ startingCapital: number; peakEquity: number } | null> {
  try {
    const res = await supabase
      .from("risk_live_equity_snapshots")
      .select("equity, recorded_at")
      .eq("profile_id", userId)
      .eq("verified", true)
      .order("recorded_at", { ascending: true })
      .limit(5000);
    if (res.error) return null;
    const equities = ((res.data ?? []) as { equity: number }[]).map((r) => Number(r.equity)).filter((e) => e > 0);
    if (equities.length === 0) return null;
    return { startingCapital: equities[0], peakEquity: Math.max(...equities) };
  } catch {
    return null;
  }
}

/**
 * A live account's starting capital: its first verified equity read
 * (`risk_live_equity_snapshots`), the figure A-RISK-07 reads, until net
 * deposits are read from the broker. Null when none is on record or it can't
 * be read; the trading unit then reads the equity alone (A-RISK-04).
 */
export async function readLiveStartingCapital(supabase: SupabaseClient, userId: string): Promise<number | null> {
  return (await readLiveCapitalRecord(supabase, userId))?.startingCapital ?? null;
}

/** A-RISK-07's ceiling for this account at `equity`, or null where it doesn't apply or can't be read. */
export async function readProfitCeiling(
  supabase: SupabaseClient,
  userId: string,
  mode: "paper" | "live",
  equity: number,
): Promise<number | null> {
  if (mode === "live") {
    const record = await readLiveCapitalRecord(supabase, userId);
    if (!record) return null;
    return profitRiskCeiling(equity, record.startingCapital, Math.max(record.peakEquity, equity) - record.startingCapital);
  }
  const peak = await readPaperPeakProfits(supabase, userId);
  return profitRiskCeiling(equity, STARTING_CASH, peak ?? 0);
}
