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
 *   - This uses the **prior completed swing's** extreme plus Gann's 3-point
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
 *   - **Primary text for both** (added 2026-09-27, roadmap item A8 / C4): the
 *     Master Stock Market Course, Ch. 9, states the lost-motion allowance
 *     (averaging about 1⅞, never a full 3) and the averaging of nearby levels
 *     into one. *Wall Street Stock Selector* (1930) and *Truth of the Stock
 *     Tape* (1923) apply "3 points beyond the old top or bottom" throughout.
 *
 * **The allowance is Gann's 3 points, price-scaled** (2026-10-15, owner:
 * "Use Gann's full 3 points now"; PLAN.md item 3). It was a fixed 0.3% until
 * then, about a tenth of Gann's figure at the prices he wrote for. Gann's
 * points are a 1930s absolute, so `lib/gann/pointScale.ts` scales them with
 * the price the way he scaled them himself (3 points at $25–60, 5–10 at
 * $100–300); the exits and the stop-breach test already read it. The trigger
 * is the old top plus 3 points at that top's price, and the stop is the
 * protective swing less 3 points at its price. The crossing is counted once,
 * here: `entryConfirmation.ts` treats a close beyond this trigger as the
 * break and adds no second allowance.
 *
 * ---
 *
 * **Designed through the three lenses AGENTS.md requires** ("Hermetic
 * principles & cycle theory", elevated to an active design input 2026-09-17):
 *
 * 1. **Gann source.** `docs/GANN_HISTORICAL_SOURCES.md` A8 — the nine numbered
 *    Buying Points and nine Selling Points, in his own words, stated as
 *    crossing old tops and bottoms; plus the 3-point allowance from the
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
 * decides *where* the trigger sits in the first place, and carries the whole
 * 3-point crossing in it, so the confirmation's break stage adds nothing more
 * (a second allowance would ask for 6 points).
 */

import type { Bar } from "@/lib/types";
import { gannThreePointsPct } from "@/lib/gann/pointScale";
import { SWING_CHART_DAYS, swingPivots, type SwingPivot } from "@/lib/gann/swingChart";

export type TriggerDirection = "bullish" | "bearish";

/**
 * Which swing chart the entry trigger reads.
 *
 * The 3-Day Chart, not the weekly chart. Both are Gann's, and `swingChartTrend`
 * already requires them to agree before it scores the *trend* — but an entry
 * needs a level near enough to current price to be actionable, and the weekly
 * chart's pivots are by construction further away and older. The weekly chart
 * governs whether the trend is real; the 3-day chart governs where this leg's
 * old top sits.
 */
export const ENTRY_TRIGGER_SWING_DAYS = SWING_CHART_DAYS.threeDay;

/**
 * Which of Gann's buying points priced the plan:
 * - `crossing`: cross the old top by 3 points, buy the reaction 1 point above
 *   it, stop 3 points under it (W006 pp.20, 46-47).
 * - `oldLevel`: a resting buy at the old bottom, the double or triple bottom,
 *   stop 3 points under it (W006 pp.11, 20, 46). Shorts mirror both.
 */
export type GannEntryKind = "crossing" | "oldLevel";

export interface GannEntryTrigger {
  kind: GannEntryKind;
  direction: TriggerDirection;
  /**
   * The price that must be exceeded for the trade to trigger — the old top or
   * bottom, plus Gann's 3 points at that level's price.
   */
  triggerPrice: number;
  /**
   * Structural stop: beyond the protective swing on the other side, by the
   * same allowance. Gann places the stop past the level, not at it, for the
   * same reason the trigger clears it.
   */
  stopPrice: number;
  /** The old top (bullish) or bottom (bearish) being crossed. */
  pivot: SwingPivot;
  /** The crossed level itself (`pivot.price`). */
  level: number;
  /**
   * Gann's buy on the reaction after the crossing: 1 point past the level
   * (W006 pp.20, 46-47: "old top 50, advance to 53, buy 51 down to 48, stop
   * 47"). Price-scaled: one third of the 3 points at the level.
   */
  reactionEntry: number;
  /** Gann's stop for the reaction buy: 3 points the other side of the level. */
  reactionStop: number;
  /** The swing on the other side that the stop sits beyond. */
  protectivePivot: SwingPivot;
  /**
   * The level has already been crossed by 3 points, not broken back and not
   * yet bought: the buy is the reaction to `reactionEntry` (PLAN.md item 5).
   * `stopPrice` is then `reactionStop`, the stop Gann gives that buy.
   */
  held: boolean;
  /** Time of the close that crossed a held level; null when not held. */
  crossedAt: string | null;
  /**
   * `oldLevel` only: how many completed bottoms (tops for a short) already sit
   * at the level, so a fill makes the double (1) or triple (2) bottom.
   */
  tests?: number;
  /** Which swing-chart reversal count produced these pivots. */
  swingDays: number;
}

function buffered(price: number, direction: 1 | -1, bufferPct?: number): number {
  return price * (1 + (direction * (bufferPct ?? gannThreePointsPct(price))) / 100);
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
  /** Overrides Gann's price-scaled 3 points (the intraday replay scales its own). */
  bufferPct?: number,
  /**
   * Keep a crossed, unbroken level as the buying point (the reaction buy).
   * The intraday replay profile still measures the breakout through the
   * latest swing, so it passes false; it has not been moved to the reaction
   * entry (PLAN.md item 5).
   */
  holdCrossedLevel = true,
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
  const sign = direction === "bullish" ? 1 : -1;
  const crossed = holdCrossedLevel ? latestCrossedLevel(bars, pivots, direction, bufferPct) : null;
  const held = crossed && !crossed.spent ? crossed : null;
  const pivot = held?.pivot ?? (direction === "bullish" ? lastTop : lastBottom);
  // A level already bought (or broken) is not offered again: until a newer
  // top forms there is no buying point (PLAN.md item 5).
  if (crossed?.spent && crossed.pivot.index === pivot.index) return null;
  const protectivePivot = direction === "bullish" ? lastBottom : lastTop;

  const triggerPrice = buffered(pivot.price, sign, bufferPct);
  const points = Math.abs(triggerPrice - pivot.price);
  const reactionEntry = pivot.price + (sign * points) / 3;
  const reactionStop = pivot.price - sign * points;

  if (held) {
    // The buy on a held level is the reaction, and its stop is Gann's own, 3
    // points the other side of the level (W006 p.20). The protective swing
    // may have formed above the crossing since, so it does not price this
    // trade and cannot void it.
    return {
      kind: "crossing", direction, triggerPrice, stopPrice: reactionStop, pivot, level: pivot.price,
      reactionEntry, reactionStop, protectivePivot, held: true, crossedAt: bars[held.crossedAt].t, swingDays,
    };
  }

  const stopPrice = buffered(protectivePivot.price, sign === 1 ? -1 : 1, bufferPct);

  // A trigger on the wrong side of its own stop is not a trade. This can
  // happen when the two pivots sit within a combined buffer's width of each
  // other in a very tight range; the honest read is "no setup here" rather
  // than a plan with inverted or zero risk that downstream position sizing
  // would divide by.
  if (direction === "bullish" ? stopPrice >= triggerPrice : stopPrice <= triggerPrice) {
    return null;
  }

  return { kind: "crossing", direction, triggerPrice, stopPrice, pivot, level: pivot.price, reactionEntry, reactionStop, protectivePivot, held: false, crossedAt: null, swingDays };
}

/**
 * Gann's double and triple bottoms as a buying point (PLAN.md item 5, step 2):
 * a resting buy at the last completed bottom, stop 3 points under it. "Buy at
 * double or triple bottoms with a stop 1 to 3 points under, never more than
 * 3" (W006 pp.20, 46); a triple bottom that holds the third time is followed
 * by an advance (p.11). The order at the old bottom is what buys the second
 * test; once a later bar has traded to the level, that test is the buy, and
 * the next level is the bottom the test completes. Shorts mirror it against
 * the last completed top (pp.22, 47: sell against single, double or triple
 * tops, stop 3 points above).
 *
 * Engineering choices, labelled as such: the order is a limit at the level
 * (Gann says "buy at" the bottom and names no order type), and earlier bottoms
 * count as the same level when within 3 points of it, the margin by which
 * Gann says a bottom still holds (A-LEVELS-06). Neither moves the order or
 * the stop; `tests` is display.
 */
export function computeGannOldLevelEntry(
  bars: Bar[],
  direction: TriggerDirection,
  swingDays: number = ENTRY_TRIGGER_SWING_DAYS,
): GannEntryTrigger | null {
  const pivots = swingPivots(bars, swingDays);
  // As for the crossing: a swing on each side, so the bottom is a completed
  // swing and not just where the history starts.
  if (pivots.length < 2) return null;
  const kind = direction === "bullish" ? "bottom" : "top";
  const sign = direction === "bullish" ? 1 : -1;
  const own = pivots.filter((p) => p.kind === kind);
  const pivot = own[own.length - 1];
  if (!pivot) return null;
  // Already tested since it formed: that test was the buy.
  for (let i = pivot.index + 1; i < bars.length; i++) {
    if (sign * ((sign === 1 ? bars[i].l : bars[i].h) - pivot.price) <= 0) return null;
  }
  const points = Math.abs(buffered(pivot.price, sign, undefined) - pivot.price);
  const reactionStop = pivot.price - sign * points;
  const tests = own.filter((p) => Math.abs(p.price - pivot.price) <= points).length;
  const opposite = [...pivots].reverse().find((p) => p.kind !== kind) ?? pivot;
  return {
    kind: "oldLevel",
    direction,
    triggerPrice: pivot.price,
    stopPrice: reactionStop,
    pivot,
    level: pivot.price,
    reactionEntry: pivot.price,
    reactionStop,
    protectivePivot: opposite,
    held: false,
    crossedAt: null,
    tests,
    swingDays,
  };
}

/** The price a buying point fills at: the reaction buy, or the old level. */
function entryOf(t: GannEntryTrigger): number {
  // A crossing not yet made has to reach its 3-point line first.
  return t.kind === "crossing" && !t.held ? t.triggerPrice : t.reactionEntry;
}

/**
 * The buying point a plan is priced from: of the crossing and the old level,
 * the one nearer the price (PLAN.md item 5, step 2). Gann ranks neither
 * against the other; a set of resting orders is filled by whichever price
 * reaches first, which is the nearer one. On a tie, the crossing.
 */
export function selectGannEntry(
  bars: Bar[],
  direction: TriggerDirection,
  swingDays: number = ENTRY_TRIGGER_SWING_DAYS,
): GannEntryTrigger | null {
  const crossing = computeGannEntryTrigger(bars, direction, swingDays);
  const old = computeGannOldLevelEntry(bars, direction, swingDays);
  if (!crossing || !old || bars.length === 0) return crossing ?? old;
  const price = bars[bars.length - 1].c;
  return Math.abs(entryOf(old) - price) < Math.abs(entryOf(crossing) - price) ? old : crossing;
}

/**
 * The old top (bottom for a short) crossed most recently by a close 3 points
 * beyond it, or null. `spent` once a later bar has traded to the buy 1 point
 * past it (bought), or closed 3 points back through it (broken).
 *
 * Gann's buy is on the reaction after the crossing, and the crossed level
 * holds until it is bought or broken (W006 pp.20, 46-47; PLAN.md item 5,
 * defect 1). A reaction of 3 days or more completes a new top at the high
 * after the crossing; without this, the buying point would move to that new
 * top and the reaction buy Gann describes would never be placed.
 *
 * The level is chosen by when it was crossed, not when its top formed: the
 * latest crossing is the live one (on the same close, the higher top for a
 * long). Once that level is bought or broken, older ones are not revived.
 * The bar that crosses is not the reaction; the buy needs a later bar.
 */
function latestCrossedLevel(
  bars: Bar[],
  pivots: SwingPivot[],
  direction: TriggerDirection,
  bufferPct?: number,
): { pivot: SwingPivot; crossedAt: number; spent: boolean } | null {
  const kind = direction === "bullish" ? "top" : "bottom";
  const sign = direction === "bullish" ? 1 : -1;
  let best: { pivot: SwingPivot; crossedAt: number } | null = null;
  for (const p of pivots) {
    if (p.kind !== kind) continue;
    const line = buffered(p.price, sign, bufferPct);
    for (let i = p.index + 1; i < bars.length; i++) {
      if (sign * (bars[i].c - line) >= 0) {
        if (!best || i > best.crossedAt || (i === best.crossedAt && sign * (p.price - best.pivot.price) > 0)) {
          best = { pivot: p, crossedAt: i };
        }
        break;
      }
    }
  }
  if (!best) return null;
  const level = best.pivot.price;
  const points = Math.abs(buffered(level, sign, bufferPct) - level);
  const buy = level + (sign * points) / 3;
  // Bought once a later bar trades to the buy. A close 3 points back through
  // the level (broken) always trades through the buy first, so this one test
  // covers both ends.
  for (let i = best.crossedAt + 1; i < bars.length; i++) {
    const b = bars[i];
    if (sign * ((sign === 1 ? b.l : b.h) - buy) <= 0) return { ...best, spent: true };
  }
  return { ...best, spent: false };
}

/**
 * The line a close must cross before Gann's reaction buy is placed, recovered
 * from a plan's own entry and stop (PLAN.md item 4). A Gann plan stores the
 * reaction entry (the level plus 1 point) and its stop (the level less 3
 * points), so the gap between them is 4 points and the crossing (the level
 * plus 3 points) sits 2 points past the entry: `entry + (entry - stop) / 2`.
 * Shorts are the mirror and the same formula gives it. Stored plans need no
 * extra column for it.
 */
export function gannBreakLine(entry: number, stop: number): number {
  return entry + (entry - stop) / 2;
}

/** The crossed level itself, recovered the same way: `(3 * entry + stop) / 4`. */
export function gannCrossedLevel(entry: number, stop: number): number {
  return (3 * entry + stop) / 4;
}
