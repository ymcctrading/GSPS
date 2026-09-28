/**
 * What the live scan arms and prices a trade from, factored out so the
 * backtest replay (`lib/backtest/replay.ts`) runs the identical code rather
 * than a re-implementation of it.
 *
 * Why this module exists (2026-09-25, alignment audit findings F3.1–F3.3,
 * project-owner sign-off): after the 2026-09-17 move from STRAT to Gann's
 * swing-crossing trigger, `lib/scanTicker.ts` computed the trigger from
 * **daily** bars in the macro-derived direction, while the replay computed it
 * from **15-minute** bars, only on STRAT-detected candidates, in the
 * pattern's direction, and additionally filtered it through the STRAT gap
 * rule and risk floor. Every replay run since then measured a trigger
 * production never used — the same failure shape as the `harmonicProximity`
 * stale anchor (AGENTS.md, "Cross-platform consistency"). Sharing the code is
 * the structural fix: the two surfaces cannot drift if there is only one.
 *
 * Three-question mandate:
 *
 * 1. **Gann.** Nothing new is sourced here. The trigger is
 *    `lib/gann/entryTrigger.ts` (A8's Buying/Selling Points), and the
 *    direction is `weightedTrendAgreement`'s chart-timeframe power ratio
 *    (`Wall Street Stock Selector`, 1930). This module only decides that both
 *    surfaces read them the same way.
 * 2. **Cycles.** No periodicity claim, so Dewey's checklist does not apply.
 * 3. **Hermetic.** Correspondence ("as above, so below"): what the replay
 *    measures has to correspond to what the scan does, or the measurement
 *    describes nothing. Cause and Effect applies to the replay specifically.
 *    An outcome can only be attributed to a cause the platform actually acts
 *    on.
 */

import type { StratPattern, TrendReading } from "@/lib/types";
import type { SetupKind } from "@/lib/types";
import { weightedTrendAgreement } from "@/lib/gann/timeframeWeight";
import {
  CONTINUATION_PATTERNS,
  detectPatterns,
  gapRuleViolated,
  riskFloorViolated,
} from "@/lib/strat/patterns";

export type EntryDirection = "bullish" | "bearish";

/**
 * The fewest daily bars the scan will read a symbol on. Below this,
 * `scanTicker` refuses the symbol, and the replay does not arm a session.
 * One constant, so the two can't disagree about which history counts.
 */
export const MIN_DAILY_BARS_FOR_SCAN = 30;

/**
 * At least two of the three macro timeframes (monthly, weekly, daily; the
 * hourly never counts) read `direction`. This is the continuation pass's
 * breadth requirement. It is deliberately not the power-ratio weighting
 * `preferredEntryDirection` uses: a single heavily weighted timeframe would
 * satisfy a weighted score on its own, and this gate exists to demand
 * agreement across timeframes.
 */
export function macroBreadthAgrees(
  trends: Pick<TrendReading, "timeframe" | "direction">[],
  direction: EntryDirection,
): boolean {
  return trends.filter((t) => t.timeframe !== "1Hour" && t.direction === direction).length >= 2;
}

/**
 * Gann's continuation (2026-09-28, project owner: the STRAT shape gate "is not
 * Gann methodology, so implement Gann's methods"): buy on crossing an old top
 * while the trend is up, sell on breaking an old bottom while it is down (the
 * nine Buying and Selling Points, A8; "buy on crossing old tops in a bull
 * market", A5). The entry already crosses a swing extreme in `direction`
 * (`lib/gann/entryTrigger.ts`); what makes it a continuation rather than a
 * reversal is that the daily swing chart, confirmed by its stepping swings,
 * already runs that way (`readGannTrend`, via `readTrend`'s 1Day reading).
 * Replaces `isContinuationShape` as the gate on the live scan and the replay.
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. No periodicity claim.
 * 3. Rhythm: a continuation joins the swing already under way instead of
 * reading a bar sequence.
 */
export function isGannContinuation(
  trends: Pick<TrendReading, "timeframe" | "direction">[],
  direction: EntryDirection,
): boolean {
  return trends.some((t) => t.timeframe === "1Day" && t.direction === direction);
}

/**
 * The direction the scan arms a reversion setup in: against the macro move,
 * where the macro move is read with Gann's chart-timeframe power ratio rather
 * than a flat vote (a single monthly trend outweighs weekly and daily
 * disagreeing with it). A caller hunting a continuation supplies its own
 * direction instead.
 */
export function preferredEntryDirection(
  macroTrends: TrendReading[],
  preference?: { direction: EntryDirection },
): EntryDirection {
  if (preference) return preference.direction;
  const macroDir = weightedTrendAgreement(macroTrends, "bearish").agrees ? "bearish" : "bullish";
  return macroDir === "bearish" ? "bullish" : "bearish";
}

// Three-bar compound setups carry more context than a bare 2-2 (which arms on
// almost every directional bar), so rank them ahead of it.
function specificity(name: StratPattern["name"]): number {
  switch (name) {
    case "2-1-2":
    case "3-1-2":
    case "1-2-2":
    case "3-2-2":
      return 0;
    case "PMG":
      return 1;
    case "2-2":
      return 2;
  }
}

/**
 * The bar-sequence patterns armed on the closed execution bars, ranked the
 * way the scan shows them. Display and confluence only. Since 2026-09-17
 * these patterns do not arm or price the trade (AGENTS.md, "Entry pricing
 * moved off STRAT"), but the top one still feeds `computeScore`'s
 * bare-reversal confirmation. The replay therefore has to pick it the same
 * way the scan does.
 */
export function rankArmedPatterns(input: {
  closedExecutionBars: Parameters<typeof detectPatterns>[0];
  currentPrice: number;
  executionAtr: number;
  preferredDirection: EntryDirection;
  setupKind: SetupKind;
}): StratPattern[] {
  const { closedExecutionBars, currentPrice, executionAtr, preferredDirection, setupKind } = input;
  const armed = detectPatterns(closedExecutionBars).filter(
    (p) => !gapRuleViolated(p, currentPrice) && !riskFloorViolated(p, executionAtr),
  );

  // A continuation is carried by the compound patterns that break in the
  // direction of the bar sequence; the 2-2 family reverses it. Within the
  // preferred direction, rank the continuation shapes first when that is what
  // was asked for.
  const kindRank = (p: StratPattern): number =>
    setupKind === "continuation" && !CONTINUATION_PATTERNS.has(p.name) ? 1 : 0;

  return [...armed].sort((a, b) => {
    const aRev = a.direction === preferredDirection ? 0 : 1;
    const bRev = b.direction === preferredDirection ? 0 : 1;
    if (aRev !== bRev) return aRev - bRev;
    const kind = kindRank(a) - kindRank(b);
    if (kind !== 0) return kind;
    const spec = specificity(a.name) - specificity(b.name);
    if (spec !== 0) return spec;
    return Math.abs(a.triggerPrice - currentPrice) - Math.abs(b.triggerPrice - currentPrice);
  });
}
