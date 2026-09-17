/**
 * Gann's own entry trigger: crossing an old top or bottom.
 *
 * This replaces the bar-sequence trigger that set every trade plan's entry
 * price until 2026-09-17. The two are the same *mechanism* — a breakout past
 * a reference level, plus a small buffer — differing only in which level, and
 * that difference is the whole point:
 *
 *   - The previous rule used the **prior bar's** extreme plus one cent
 *     (`lib/strat/patterns.ts`, `last.h + PENNY`). Both the level and the
 *     buffer came from Rob Smith's STRAT, which has no Gann source.
 *   - This uses the **prior completed swing's** extreme plus a "lost motion"
 *     buffer. Both are disclosed by Gann himself.
 *
 * Sources (`docs/GANN_HISTORICAL_SOURCES.md` A8, the "45 Years in Wall Street"
 * material):
 *
 *   - **The level.** All nine numbered Buying Points and nine Selling Points
 *     are stated against *crossing old tops and bottoms* — not against the
 *     previous session's high. A swing top is the level; a single bar's high
 *     is noise the swing chart exists to filter (see `swingChart.ts`'s header
 *     on exactly that point).
 *   - **The buffer.** Gann's "lost motion": price typically overshoots a
 *     level by up to ~1⅞ cents but rarely a full 3 cents, which is his stated
 *     reason for placing stops exactly 3 cents beyond a level. A bare touch of
 *     an old top is therefore not a cross; clearing it by a real margin is.
 *
 * **Why the buffer is a percentage and not 3 cents.** Gann's figure is a
 * 1930s stock-price-era absolute, and this platform prices equities and
 * crypto across many orders of magnitude — three cents is a rounding error on
 * one and a large move on another. Per AGENTS.md's "WD Gann precedence"
 * principle, which distinguishes implementing a disclosed *rule* from porting
 * its literal magnitude, this implements the rule as a percentage. The same
 * decision, for the same reason, was already made twice in this codebase:
 * `lib/strat/levels.ts`'s `combineNearbyLevels` and
 * `lib/lifecycle/entryConfirmation.ts`'s "3-point rule" buffer. This module
 * reuses that second one's constant rather than introducing a third number
 * for the same concept.
 *
 * ---
 *
 * **Designed through the three lenses AGENTS.md requires** ("Hermetic
 * principles & cycle theory", elevated to an active design input 2026-09-17):
 *
 * 1. **Gann source.** `docs/GANN_HISTORICAL_SOURCES.md` A8 — the nine numbered
 *    Buying Points and nine Selling Points, in his own words, stated as
 *    crossing old tops and bottoms; plus the "lost motion" allowance from the
 *    Resistance Level method in the same source. Tier: primary, his own
 *    published material.
 *
 * 2. **Cycle theory.** This rule makes no claim about periodicity — it does
 *    not assert that swings recur on any interval, only that *this* completed
 *    swing's extreme is the level to cross. So Dewey's seven-item checklist
 *    does not gate it, and saying which items were cleared would be a category
 *    error rather than diligence. Stated explicitly because AGENTS.md requires
 *    the checklist to be addressed, and "not applicable, because no
 *    periodicity is claimed" is an answer to it. Where a genuine cycle claim
 *    IS made, see `lib/gann/spectralCycle.ts`, which evaluates three of the
 *    seven and names the four it cannot.
 *
 * 3. **Hermetic principle: Polarity.** The Buying Points and Selling Points
 *    are the same rule in opposite senses, and `computeGannEntryTrigger`
 *    implements them as an exact mirror rather than two code paths — a long
 *    crosses the old top and is protected beyond the old bottom; a short is
 *    that reflected. Secondarily **Rhythm**: the swing chart this reads from
 *    is a rhythm filter, which is precisely why the trigger belongs on a swing
 *    extreme rather than on the last bar's high, where noise sets the level.
 *
 * ---
 *
 * **Relationship to `entryConfirmation.ts`.** That module confirms an entry
 * that has already been triggered, staging touch → break → retest. This one
 * decides *where* the trigger sits in the first place. Both now express
 * "clear the level by a real margin" through the same constant, so a change
 * to what counts as a real margin moves both together.
 */

import type { Bar } from "@/lib/types";
import { DEFAULT_CONFIRMATION_BUFFER_PCT } from "@/lib/lifecycle/entryConfirmation";
import { SWING_CHART_DAYS, swingPivots, type SwingPivot } from "@/lib/gann/swingChart";

export type TriggerDirection = "bullish" | "bearish";

/**
 * Gann's "lost motion" allowance, as a percentage of the level being crossed.
 *
 * Deliberately the same value as `entryConfirmation.ts`'s break-stage buffer:
 * both answer "how far beyond a level counts as genuinely beyond it," and two
 * different answers to one question is the drift AGENTS.md's cross-platform
 * consistency principle is about.
 */
export const LOST_MOTION_BUFFER_PCT = DEFAULT_CONFIRMATION_BUFFER_PCT;

/**
 * Which swing chart the entry trigger reads.
 *
 * The 3-day chart, not the 9-day. Both are Gann's, and `swingChartTrend`
 * already requires them to agree before it scores the *trend* — but an entry
 * needs a level near enough to current price to be actionable, and the 9-day
 * chart's pivots are by construction further away and older. The 9-day chart
 * governs whether the trend is real; the 3-day chart governs where this leg's
 * old top sits.
 */
export const ENTRY_TRIGGER_SWING_DAYS = SWING_CHART_DAYS.threeDay;

export interface GannEntryTrigger {
  direction: TriggerDirection;
  /**
   * The price that must be exceeded for the trade to trigger — the old top or
   * bottom, plus the lost-motion allowance.
   */
  triggerPrice: number;
  /**
   * Structural stop: beyond the protective swing on the other side, by the
   * same allowance. Gann places the stop past the level, not at it, for the
   * same lost-motion reason the trigger clears it.
   */
  stopPrice: number;
  /** The old top (bullish) or bottom (bearish) being crossed. */
  pivot: SwingPivot;
  /** The swing on the other side that the stop sits beyond. */
  protectivePivot: SwingPivot;
  /** Which swing-chart reversal count produced these pivots. */
  swingDays: number;
}

function buffered(price: number, direction: 1 | -1, bufferPct: number): number {
  return price * (1 + (direction * bufferPct) / 100);
}

/**
 * The armed Gann entry for this direction, or null when the swing chart has
 * not yet produced both an old top and an old bottom to work from.
 *
 * Null is a real answer, not a failure: with no completed swing on both
 * sides there is no old level to cross and no protective swing to stop
 * beyond, so there is no trade Gann's rules would take. Callers treat it the
 * same way they treated a missing bar-sequence pattern — no armed setup, no
 * priced plan.
 */
export function computeGannEntryTrigger(
  bars: Bar[],
  direction: TriggerDirection,
  swingDays: number = ENTRY_TRIGGER_SWING_DAYS,
  bufferPct: number = LOST_MOTION_BUFFER_PCT,
): GannEntryTrigger | null {
  const pivots = swingPivots(bars, swingDays);
  if (pivots.length < 2) return null;

  const lastTop = [...pivots].reverse().find((p) => p.kind === "top") ?? null;
  const lastBottom = [...pivots].reverse().find((p) => p.kind === "bottom") ?? null;
  if (!lastTop || !lastBottom) return null;

  // A long crosses the old top and is protected beyond the old bottom; a
  // short is the mirror image. Nothing here is direction-agnostic by
  // accident — Gann states the Buying Points and Selling Points separately
  // and they are symmetric, so the mirror is the rule, not a shortcut.
  const pivot = direction === "bullish" ? lastTop : lastBottom;
  const protectivePivot = direction === "bullish" ? lastBottom : lastTop;

  const triggerPrice = buffered(pivot.price, direction === "bullish" ? 1 : -1, bufferPct);
  const stopPrice = buffered(
    protectivePivot.price,
    direction === "bullish" ? -1 : 1,
    bufferPct,
  );

  // A trigger on the wrong side of its own stop is not a trade. This can
  // happen when the two pivots sit within a combined buffer's width of each
  // other in a very tight range; the honest read is "no setup here" rather
  // than a plan with inverted or zero risk that downstream position sizing
  // would divide by.
  if (direction === "bullish" ? stopPrice >= triggerPrice : stopPrice <= triggerPrice) {
    return null;
  }

  return { direction, triggerPrice, stopPrice, pivot, protectivePivot, swingDays };
}
