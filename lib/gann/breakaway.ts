/**
 * Gann's breakaway rule for sideways markets (owner decision 5, 2026-09-27).
 *
 * Gann: when a market moves sideways in a narrow range, for 2 to 6 weeks or
 * 10 to 13 weeks, it is accumulating or distributing, and the trader stays
 * out until it breaks away. Buy when it crosses the top of the range, sell
 * when it breaks the bottom; a trade inside the range is a guess about which
 * way it will leave (*How to Make Profits in Commodities*, 1951, pp. 51-52;
 * `docs/memory-bank/sources/A08_*`, Tier A).
 *
 * So a range-bound market can be context (Watch) but not an instruction to
 * act (Execute) unless the armed entry is the breakaway itself: the trigger
 * crosses the highest completed top (long) or lowest completed bottom (short)
 * of the range.
 *
 * Engineering choices, labelled as such:
 * - "Range-bound" is `isGannRangeBound`: the weekly swing chart's trend is
 *   not confirmed by stepping 3-day swings. That is the codebase's existing
 *   Gann-grounded negation of a trend (`trendStrength.ts`).
 * - The range is the completed 3-Day Chart tops and bottoms from the last
 *   91 calendar days, Gann's upper bound of 13 weeks. The same chart arms the
 *   entry trigger, so the comparison is like for like.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: the 2-6 and 10-13 week durations are Gann's observed lengths of
 *    accumulation, used here only as the lookback bound. No periodicity claim
 *    is made, so Dewey's checklist does not apply.
 * 3. Hermetic: Polarity. A range is the market held between two poles, and
 *    the rule acts only once one pole gives way. Rhythm also fits: the range
 *    is the market's rest between swings, and the breakaway is the next beat.
 */

import type { Bar } from "@/lib/types";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { isGannRangeBound } from "@/lib/gann/trendStrength";
import { swingPivots } from "@/lib/gann/swingChart";

/** Gann's upper bound for a narrow sideways range: 13 weeks. */
export const BREAKAWAY_RANGE_DAYS = 91;

const DAY_MS = 24 * 3600 * 1000;

export interface BreakawayReading {
  rangeBound: boolean;
  /** The range's highest completed top and lowest completed bottom, when range-bound. */
  rangeHigh: number | null;
  rangeLow: number | null;
  /** The armed entry crosses the range's extreme in its own direction. */
  breaksAway: boolean;
}

export function readBreakaway(daily: Bar[], trigger: GannEntryTrigger | null): BreakawayReading {
  if (daily.length === 0 || !isGannRangeBound(daily)) {
    return { rangeBound: false, rangeHigh: null, rangeLow: null, breaksAway: true };
  }
  const cutoff = Date.parse(daily[daily.length - 1].t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  const pivots = swingPivots(daily, trigger?.swingDays ?? 3).filter((p) => Date.parse(daily[p.index].t) >= cutoff);
  const tops = pivots.filter((p) => p.kind === "top").map((p) => p.price);
  const bottoms = pivots.filter((p) => p.kind === "bottom").map((p) => p.price);
  const rangeHigh = tops.length > 0 ? Math.max(...tops) : null;
  const rangeLow = bottoms.length > 0 ? Math.min(...bottoms) : null;

  let breaksAway = false;
  if (trigger) {
    breaksAway =
      trigger.direction === "bullish"
        ? rangeHigh === null || trigger.triggerPrice > rangeHigh
        : rangeLow === null || trigger.triggerPrice < rangeLow;
  }
  return { rangeBound: true, rangeHigh, rangeLow, breaksAway };
}
