/**
 * Gann's chart-timeframe "power ratio" — *Wall Street Stock Selector*
 * (1930), Tier A public book (`docs/GANN_HISTORICAL_SOURCES.md` A4):
 * higher-timeframe agreement should be weighted, not counted equally as one
 * more vote. Gann states an explicit ratio — a Weekly chart move carries
 * roughly the significance of 7 Daily moves, a Monthly move roughly 30, a
 * Yearly move roughly 365 — each ratio simply that timeframe's calendar-day
 * span relative to one daily bar. *How to Make Profits Trading in
 * Commodities* (1941/51) adds a Quarterly Chart as a fourth tier between
 * Monthly and Yearly, without restating a numeric ratio for it; this module
 * extends the same disclosed convention (calendar-day span, not an invented
 * number) rather than porting an unstated figure — 91 days ≈ one quarter,
 * consistent with how 7/30/365 are themselves derived. `Timeframe` (see
 * `lib/types.ts`) has no `"1Quarter"` value, so this table simply omits
 * that tier rather than widening the type for a value nothing currently
 * produces.
 *
 * A full repo audit (2026-09-16) found every multi-timeframe site in the
 * codebase either gates on one higher timeframe as a binary check (nothing
 * to weight — `lib/signals/states/trendPullback.ts`,
 * `trendBreakout.ts`, `confirmedReversal.ts`, `rangeReversion.ts`) or
 * combines three-plus timeframes with a flat, unweighted majority vote.
 * `lib/scanTicker.ts`'s macro-direction pattern-preference logic (choosing
 * which reversion direction to prefer when several patterns arm at once)
 * was the one live site doing the latter — a flat "2 of 3" vote across
 * monthly/weekly/daily trend direction. This module is what that site was
 * refactored to use; see its own call site for the applied context.
 *
 * This governs *pattern-selection preference* only — which of several
 * simultaneously-armed setups the live scan prioritizes showing — never a
 * scored criterion. The prior flat-vote `macroTrend` scoring criterion this
 * data also used to feed was retired 2026-09-10 for measuring negligible
 * (`lib/validation/criteria-registry.ts`'s `macroTrend` entry) after two
 * different premises were tried, both with equal-weight voting. A
 * power-ratio-weighted version of that same idea has never been tried and
 * is a materially different construction, not a third re-tuning of the
 * same one — but per this codebase's own evidence-gating discipline, it
 * stays out of `lib/scoring/score.ts` until a fresh backtest run
 * specifically measures it, exactly like every other new criterion here.
 */

import type { Direction, Timeframe, TrendReading } from "@/lib/types";

export const TIMEFRAME_POWER_RATIO: Partial<Record<Timeframe, number>> = {
  "1Day": 1,
  "1Week": 7,
  "1Month": 30,
  "1Year": 365,
};

export interface WeightedTrendAgreement {
  /** Signed sum of each timeframe's power ratio, +weight for agreement with `direction`, -weight for the opposite, 0 for sideways. */
  weightedScore: number;
  /** True when the weighted score favors `direction` (weightedScore > 0). Ties (0) read as no agreement. */
  agrees: boolean;
  /** Per-timeframe breakdown, largest weight first. */
  breakdown: { timeframe: Timeframe; direction: TrendReading["direction"]; weight: number; contribution: number }[];
}

/**
 * Weighted alternative to a flat majority vote across trend readings on
 * different timeframes. Falls back to weight 1 for any timeframe not in
 * `TIMEFRAME_POWER_RATIO` (e.g. intraday readings) rather than silently
 * dropping it.
 */
export function weightedTrendAgreement(
  trends: TrendReading[],
  direction: Exclude<Direction, "none">,
): WeightedTrendAgreement {
  const breakdown = trends
    .map((t) => {
      const weight = TIMEFRAME_POWER_RATIO[t.timeframe] ?? 1;
      const contribution = t.direction === "sideways" ? 0 : t.direction === direction ? weight : -weight;
      return { timeframe: t.timeframe, direction: t.direction, weight, contribution };
    })
    .sort((a, b) => b.weight - a.weight);

  const weightedScore = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  return { weightedScore, agrees: weightedScore > 0, breakdown };
}
