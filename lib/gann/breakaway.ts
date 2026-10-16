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

import { beyondByThreePoints } from "@/lib/gann/pointScale";
import type { Bar } from "@/lib/types";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { isGannRangeBound } from "@/lib/gann/trendStrength";
import { swingPivots } from "@/lib/gann/swingChart";

/** Gann's upper bound for a narrow sideways range: 13 weeks. */
export const BREAKAWAY_RANGE_DAYS = 91;

const DAY_MS = 24 * 3600 * 1000;
/**
 * A trigger built on the range's own top is exactly its extreme plus 3
 * points, which is the breakaway; this absorbs floating-point noise so that
 * case counts.
 */
const EPS = 1e-9;

/**
 * A double or triple bottom (top) is a test of the range's own edge, and Gann
 * gives it its own stop 3 points beyond the level (W006 pp.11, 20, 46), so it
 * is not held to Watch here; the hold still applies to a crossing inside a
 * range. Put to the owner on 2026-10-15 as a decision against owner decision
 * 5 (PLAN.md item 5, step 2); built on the recommended option until answered.
 * A single bottom that held (step 4) is read the same way, under the same
 * decision: it is a bottom of the range with its own stop 3 points under it.
 * The bear-market rally sell (step 4b) is exempt too, on a different reading,
 * labelled as such (step 4b review R3): it is offered only while the weekly
 * chart is down, so for Gann it is a sale with the trend, not a guess inside a
 * sideways market, and the daily chart reads "range-bound" during it only
 * because the rally itself has stopped confirming the decline.
 */
export const OLD_LEVEL_BUYS_IN_RANGE = true;

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
  // A held level was crossed earlier and is bought on the reaction (PLAN.md
  // item 5). The range it broke away from is the one before that crossing;
  // the top made after it is the breakaway's own move, not the range.
  const end = trigger?.held && trigger.crossedAt ? Date.parse(trigger.crossedAt) : Infinity;
  const cutoff = Math.min(Date.parse(daily[daily.length - 1].t), end) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  const pivots = swingPivots(daily, trigger?.swingDays ?? 3).filter((p) => {
    const t = Date.parse(daily[p.index].t);
    return t >= cutoff && t < end;
  });
  const tops = pivots.filter((p) => p.kind === "top").map((p) => p.price);
  const bottoms = pivots.filter((p) => p.kind === "bottom").map((p) => p.price);
  const rangeHigh = tops.length > 0 ? Math.max(...tops) : null;
  const rangeLow = bottoms.length > 0 ? Math.min(...bottoms) : null;

  let breaksAway = false;
  // A bottom that held (step 4) is a bottom of the range too.
  if (restsWithoutCrossing(trigger?.kind) && OLD_LEVEL_BUYS_IN_RANGE) {
    breaksAway = true;
  } else if (trigger) {
    breaksAway =
      trigger.direction === "bullish"
        ? rangeHigh === null || trigger.triggerPrice >= beyondByThreePoints(rangeHigh, 1) - EPS * rangeHigh
        : rangeLow === null || trigger.triggerPrice <= beyondByThreePoints(rangeLow, -1) + EPS * rangeLow;
  }
  return { rangeBound: true, rangeHigh, rangeLow, breaksAway };
}
