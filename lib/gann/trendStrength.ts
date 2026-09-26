/**
 * Gann's answer to "is this market trending, and which way" — the question
 * Wilder's ADX/DMI used to answer for the Signal & Regime Engine.
 *
 * `adxTrendStrength` came off the scorecard on 2026-09-16 for having no Gann
 * lineage, but `adx()` stayed in `lib/signals/regime.ts` and
 * `lib/signals/states/rangeReversion.ts` under the "different governing spec"
 * carve-out: those two ask whether a market is trending or ranging *at all*,
 * which is a different question from whether a Gann-selected setup is
 * confirmed. That carve-out was a stay of execution, not an acquittal —
 * AGENTS.md's "Gann-grounded platform" principle still requires a Gann answer
 * to a question this platform asks. This is it.
 *
 * **The rule.** The **9-day** swing chart carries the main trend, and the
 * trend counts as sustained when that chart has not reversed within the recent
 * lookback. The 3-day chart is deliberately NOT required to agree.
 *
 * **Why not require both charts to agree** — this was got wrong first, and the
 * error is instructive. Requiring agreement looks right (it is what the scored
 * `swingChartTrend` criterion does) and it is wrong here, because the two
 * charts answer different questions. The 3-day chart flips on three closes
 * against the swing, which is exactly what a normal pullback inside a healthy
 * trend looks like. So "both agree" is false during every pullback — and
 * `lib/signals/states/trendPullback.ts` exists precisely to evaluate a market
 * that is *in* a pullback. Requiring agreement made that state unreachable by
 * construction, which the test suite caught.
 *
 * Gann's own usage separates them the same way: the 9-day chart is the main
 * trend, the 3-day the minor swing used to time entries against it. The scored
 * criterion wants both because it is asking "is this setup confirmed at two
 * granularities"; the regime engine is asking "what is the prevailing trend",
 * and that is the 9-day chart's job alone.
 *
 * **What separates a trend from a range: swing structure.** ADX produced a
 * 0–100 magnitude compared against a threshold (20). Gann's construction has
 * no such scalar, and inventing one to preserve the old call site's shape
 * would be exactly the unsourced substance this platform's own doc comments
 * reject. What his chart gives instead is structure: in a real trend each
 * successive swing top and swing bottom is higher than the last (or lower, for
 * a downtrend); in a range they sit at the same levels while price oscillates
 * between them. So the test is "is the 9-day chart's direction backed by
 * rising tops AND rising bottoms on the swings", not "how big is a number".
 *
 * Counting reversals was tried first and is wrong, for a reason worth keeping:
 * a tight oscillation rarely strings together nine closes in one direction, so
 * it completes almost no 9-day swings and scores as *low* churn — reading a
 * textbook range as a strong trend. Frequency measures how often the chart
 * flips; it says nothing about whether price is getting anywhere.
 *
 * ---
 *
 * **Designed through the three lenses AGENTS.md requires:**
 *
 * 1. **Gann source.** `docs/GANN_HISTORICAL_SOURCES.md` A2.1 Ch. VII — the
 *    3-day and 9-day swing charts, his own disclosed trend-determination
 *    method, with the 9-day as the main-trend chart. Tier: primary. See
 *    `lib/gann/swingChart.ts` for the construction and its own sourcing note.
 *
 * 2. **Cycle theory.** No periodicity claim is made: this reports the
 *    *current* state of two swing counters, not that swings recur on any
 *    interval, so Dewey's seven-item checklist does not gate it. Stated
 *    explicitly because AGENTS.md requires the checklist to be addressed and
 *    "not applicable, no periodicity asserted" is an answer to it. The 3-day
 *    and 9-day counts are themselves a small-integer ratio (1:3), which is the
 *    kind of relationship Tomes' harmonic-resonance material concerns — but
 *    that is an observation, not evidence, and nothing here leans on it.
 *
 * 3. **Hermetic principle: Rhythm.** A trend that keeps reversing has no
 *    rhythm to trade, and reversal frequency is the direct reading of that.
 *    Secondarily **Correspondence** — the same construction read at two
 *    granularities, the coarse one governing the trend and the fine one the
 *    swing within it, which is also why this read is shared with the regime
 *    engine rather than letting that subsystem keep a separate answer.
 */

import type { Bar } from "@/lib/types";
import {
  SWING_CHART_DAYS,
  computeSwingChart,
  swingPivots,
  type SwingDirection,
} from "@/lib/gann/swingChart";

/**
 * Which chart's pivots the structure test reads.
 *
 * The 3-day chart, even though the 9-day gives the direction. The structure
 * test needs at least two tops and two bottoms to compare, and the 9-day chart
 * completes swings too rarely to supply them on a normal lookback. This is the
 * same division of labour as elsewhere: the coarse chart says which way, the
 * fine chart supplies the swings.
 */
export const STRUCTURE_SWING_DAYS = SWING_CHART_DAYS.threeDay;

export interface GannTrendRead {
  /**
   * The 9-day chart's direction when the 3-day chart's swings are stepping
   * the same way, or null when they aren't or the 9-day chart has no
   * direction yet. The 3-day chart's own direction is not required to agree —
   * it flips on every pullback (see the module header).
   *
   * Null is the honest reading of a market with no trend, and callers should
   * treat it that way rather than defaulting to a direction — the same
   * treatment `swingChartDirection` gives insufficient history.
   */
  direction: Exclude<SwingDirection, null> | null;
  /** True when the 9-day chart has a direction and `structureAgrees` — the trend-confirmed condition. */
  confirmed: boolean;
  threeDay: SwingDirection;
  nineDay: SwingDirection;
  /**
   * Whether the swings are stepping in the 9-day chart's direction — rising
   * tops and rising bottoms for a bullish read, falling for a bearish one.
   * False in a range, where tops and bottoms sit at the same levels.
   */
  structureAgrees: boolean;
}

export function readGannTrend(bars: Bar[]): GannTrendRead {
  const { threeDay, nineDay } = computeSwingChart(bars);
  const pivots = swingPivots(bars, STRUCTURE_SWING_DAYS);
  const tops = pivots.filter((p) => p.kind === "top").map((p) => p.price);
  const bottoms = pivots.filter((p) => p.kind === "bottom").map((p) => p.price);

  // Comparisons are strict, so a range whose swings return to the same levels
  // reports no structure rather than a marginal trend. With fewer than two of
  // either, there is nothing to compare and the honest answer is "no confirmed
  // structure" — not a guess from one pivot.
  const rising =
    tops.length >= 2 &&
    bottoms.length >= 2 &&
    tops[tops.length - 1] > tops[tops.length - 2] &&
    bottoms[bottoms.length - 1] > bottoms[bottoms.length - 2];
  const falling =
    tops.length >= 2 &&
    bottoms.length >= 2 &&
    tops[tops.length - 1] < tops[tops.length - 2] &&
    bottoms[bottoms.length - 1] < bottoms[bottoms.length - 2];

  const structureAgrees =
    (nineDay === "bullish" && rising) || (nineDay === "bearish" && falling);
  const confirmed = nineDay !== null && structureAgrees;

  return { direction: confirmed ? nineDay : null, confirmed, threeDay, nineDay, structureAgrees };
}

/**
 * The inverse read, for the range states.
 *
 * Deliberately defined as the negation of `confirmed` rather than as its own
 * test, so "trending" and "ranging" can never both be true of the same bars.
 * The previous arrangement had that hazard: `regime.ts` called a market
 * trending at ADX >= 20 while `rangeReversion.ts` called it ranging below its
 * own `MAX_ADX_FOR_RANGE`, two independently-tuned thresholds on one scale
 * with no guarantee they partitioned it.
 */
export function isGannRangeBound(bars: Bar[]): boolean {
  return !readGannTrend(bars).confirmed;
}
