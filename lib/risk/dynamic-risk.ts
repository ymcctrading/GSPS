/**
 * Gann's trading unit and the winning run it reads.
 *
 * Until 2026-10-21 this module also held a "bounded dynamic-risk policy"
 * (`resolveRiskBand`, `computePermittedRisk`, `quantityFromPermittedRisk`,
 * `plannedRiskDollars`): risk bands of 1 to 1.75% of equity scaled by setup,
 * execution, market and correlation multipliers. Nothing called it after
 * Gann's capital rules took over sizing and refusal (Q4, Q6, Q12,
 * `lib/risk/gannCapital.ts`), and its bands have no Gann source, so it was
 * removed (review finding R-004; AGENTS.md "Gann answers the question").
 * `RiskBandThresholds` stays only because `lib/risk/policy.ts` still resolves
 * those `policy_values` keys; nothing reads the resolved band.
 */

import {
  ABSOLUTE_TIER_CAP_PCT,
  EXCEPTIONAL_BAND_MIN_TRADES,
  MIN_TRADES_FOR_RISK_INCREASE,
  RISK_BAND_RATE_PCT,
  type RiskBand,
} from "@/lib/risk/config";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The band knobs the removed band policy read. Kept as the shape of the
 * `policy_values` keys `lib/risk/policy.ts` still resolves; no consumer reads them.
 */
export interface RiskBandThresholds {
  minTradesForRiskIncrease: number;
  exceptionalBandMinTrades: number;
  absoluteTierCapPct: number;
  riskBandRatePct: Record<RiskBand, number>;
}

export const DEFAULT_RISK_BAND_THRESHOLDS: RiskBandThresholds = {
  minTradesForRiskIncrease: MIN_TRADES_FOR_RISK_INCREASE,
  exceptionalBandMinTrades: EXCEPTIONAL_BAND_MIN_TRADES,
  absoluteTierCapPct: ABSOLUTE_TIER_CAP_PCT,
  riskBandRatePct: { ...RISK_BAND_RATE_PCT },
};

/**
 * Gann's trading unit (A-RISK-04, M-K3; owner, 2026-10-16, Q7). The capital a
 * per-trade risk percent is applied to:
 * - it stays at the starting capital until profits equal it, then doubles,
 *   and doubles again each time the capital doubles (Master Course: when your
 *   profits equal your original capital, you may double your unit);
 * - it is never raised on the gains of a long run of wins (rule 24: "never
 *   increase your trading after a long run of success"), so during such a run
 *   the step is read from the equity the run began with;
 * - it is never more than the equity that is left, so a loss shrinks it.
 *
 * Engineering choices, labelled: "a long run" is `GANN_LONG_RUN_WINS`
 * consecutive closed wins, the same three the series-of-losses rule counts
 * (`lib/risk/lossSeries.ts`); the unit steps by whole doublings.
 *
 * Three-question basis:
 * 1. Gann: as cited (A-RISK-04, Tier A; M-K3, rule 24).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (size is earned by profit already banked, not
 *    by a streak) and Polarity (losses shrink the unit at once, gains raise it
 *    only once doubled).
 */
export const GANN_LONG_RUN_WINS = 3;

export interface GannRiskCapitalInput {
  equity: number;
  startingCapital: number;
  /** Closed trades won in a row, most recent first. */
  consecutiveWins: number;
  /** Realised profit of that run of wins, in dollars. */
  streakProfitUsd: number;
}

export interface GannRiskCapital {
  capital: number;
  /** The unit is above the starting capital. */
  doubled: boolean;
  /** A long run of wins held the unit where the run began. */
  frozen: boolean;
}

export function gannRiskCapital(input: GannRiskCapitalInput): GannRiskCapital {
  const { equity, startingCapital, consecutiveWins, streakProfitUsd } = input;
  const longRun = consecutiveWins >= GANN_LONG_RUN_WINS;
  // With no starting capital on record (a live account), only rule 24 can be
  // read: during a long run the unit is the equity the run began with.
  if (!(startingCapital > 0)) {
    const held = longRun && streakProfitUsd > 0;
    return { capital: Math.max(0, held ? equity - streakProfitUsd : equity), doubled: false, frozen: held };
  }
  const unitFor = (e: number) => startingCapital * 2 ** Math.max(0, Math.floor(Math.log2(Math.max(e, startingCapital) / startingCapital) + 1e-12));
  const unit = longRun ? Math.min(unitFor(equity), unitFor(equity - Math.max(streakProfitUsd, 0))) : unitFor(equity);
  return {
    capital: Math.max(0, Math.min(equity, unit)),
    doubled: unit > startingCapital,
    frozen: longRun && unit < unitFor(equity),
  };
}

/**
 * The run of closed wins ending at the latest close, and its realised profit,
 * from `trade_logs` (paper and live closes, as `lossSeries.ts` reads them).
 * Null when it can't be read; callers then take no step-up.
 */
export async function readWinningRun(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ consecutiveWins: number; streakProfitUsd: number } | null> {
  let data: unknown[] | null;
  try {
    const res = await supabase
      .from("trade_logs")
      .select("outcome, profit_loss_dollars, exit_timestamp")
      .eq("user_id", userId)
      .in("outcome", ["profit", "loss"])
      .not("exit_timestamp", "is", null)
      .order("exit_timestamp", { ascending: false })
      .limit(50);
    if (res.error) return null;
    data = res.data;
  } catch {
    return null;
  }
  let consecutiveWins = 0;
  let streakProfitUsd = 0;
  for (const row of (data ?? []) as { outcome: string; profit_loss_dollars: number | null }[]) {
    if (row.outcome !== "profit") break;
    consecutiveWins++;
    streakProfitUsd += Number(row.profit_loss_dollars ?? 0);
  }
  return { consecutiveWins, streakProfitUsd };
}
