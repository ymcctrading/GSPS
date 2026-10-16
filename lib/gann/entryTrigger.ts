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
import { beyondByThreePoints, gannThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";
import { SWING_CHART_DAYS, WEEKLY_SWING_CHART, swingPivots, walkSwingChart, type SwingPivot } from "@/lib/gann/swingChart";
import { readCounterMove } from "@/lib/gann/disclosedRules";
import { restsWithoutCrossing, type GannEntryKind, type GannHoldBasis } from "@/lib/gann/entryKind";

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
 * - `hold`: a bottom that has held, bought at the market's last close with
 *   the stop 3 points under it (W006 pp.20, 24, 46-47; PLAN.md item 5, step 4).
 */
export type { GannEntryKind } from "@/lib/gann/entryKind";

/**
 * Where the level came from (PLAN.md item 5, step 3):
 * - `swing`: a completed top or bottom on the 3-Day Chart.
 * - `priorYear`: a previous calendar year's top or bottom, every year in the
 *   span (W006 pp.20, 22, 47: cross the top of a previous year by 3 points and
 *   buy any small reaction; break the bottom of a previous year by 3 points
 *   and it is a short). `levelYear` says which year.
 * - `allTime`: the highest top (lowest bottom) on record before the 52 weeks
 *   the 3-Day Chart is read from: an old top like any other, and the oldest
 *   the chart holds (p.24). The record is the `OLDER_LEVELS_YEARS` calendar
 *   years before the day, or as much of them as the feed holds, not the
 *   stock's whole life.
 *
 * The geometry of these crossings is an inference, labelled as one (PLAN.md
 * pass rule 1). Gann gives the crossing of a previous year's top (A-ENTRY-05),
 * a new record (A-ENTRY-06) and the break of a previous year's bottom
 * (A-ENTRY-17) without their own entry and stop, so the old-top rule's
 * geometry is applied to them (A-ENTRY-04: cross by 3 points, buy 1 point
 * past the level, stop 3 points the other side). For A-ENTRY-17 that means
 * the short waits for the bounce to 1 point under the broken bottom; Gann's
 * sentence does not say to wait, and a straight break with no bounce is not
 * sold here.
 */
export type GannLevelSource = "swing" | "priorYear" | "allTime";

/** A level older than the 3-Day Chart's window, read from the monthly chart. */
export interface OlderGannLevel {
  price: number;
  kind: "top" | "bottom";
  source: Exclude<GannLevelSource, "swing">;
  /** `priorYear` only: the calendar year whose top or bottom it is. */
  year?: number;
  /** The monthly bar it was made in. */
  formedAt: string;
  /** Closes on or after this day (YYYY-MM-DD) can cross it. */
  crossFrom: string;
}

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
  /** Where the level came from. */
  source: GannLevelSource;
  /**
   * A held crossing whose close made a new record high (low for a short) on
   * the chart: above every earlier high, the record before the 52 weeks
   * included. "New all-time highs are usually safe buys" (W006 p.47). Gann
   * gives it no weight, so it is shown, not scored. Undefined without the
   * monthly record to compare against.
   */
  newRecord?: boolean;
  /**
   * When the level formed: the bar its top or bottom was made on. The older
   * the top, the more important its crossing (W006 p.24); Gann gives that no
   * weight, so it only decides between buying points that are otherwise even.
   */
  formedAt: string;
  /** A `priorYear` crossing: the calendar year whose top or bottom was crossed. */
  levelYear?: number;
  /**
   * A held crossing of an old bottom regained from below (a top lost from
   * above, for a short) after a close 3 points through it: Gann's sign that
   * the decline is over (A-TREND-10, W006 p.30). `pivot.kind` is then the
   * opposite of an ordinary crossing's.
   */
  regained?: true;
  /**
   * `hold` only: which of Gann's rules found the bottom that held. `weeks`:
   * the reaction's low stood into its second week (A-ENTRY-01). `days`: in a
   * bull market, a reaction of two to three weeks whose low held two days
   * (A-ENTRY-01 in active markets, A-ENTRY-08). `record`: the record low held
   * for weeks without a 3-point break (A-ENTRY-10).
   */
  holdBasis?: GannHoldBasis;
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
  /** Older levels from the monthly chart (`olderGannLevels`), crossed the same way. */
  older: OlderGannLevel[] = [],
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
  const crossed = holdCrossedLevel ? latestCrossedLevel(bars, pivots, direction, bufferPct, older) : null;
  const held = crossed && !crossed.spent ? crossed : null;
  const pivot = held?.pivot ?? (direction === "bullish" ? lastTop : lastBottom);
  // A level already bought (or broken) is not offered again, and neither is a
  // top the rally crossed on the way: until a newer top forms, or an older
  // one still stands uncrossed, there is no buying point (PLAN.md item 5;
  // step 3 review R3). A previous year's top can be the last swing top too.
  if (crossed?.spent && closedThrough(bars, pivot.index + 1, buffered(pivot.price, sign, bufferPct), sign)) return null;
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
    const record = older.find((l) => l.source === "allTime" && l.kind === (direction === "bullish" ? "top" : "bottom"));
    return {
      kind: "crossing", direction, triggerPrice, stopPrice: reactionStop, pivot, level: pivot.price,
      reactionEntry, reactionStop, protectivePivot, held: true, crossedAt: bars[held.crossedAt].t, swingDays,
      source: held.source, formedAt: held.formedAt,
      ...(held.levelYear !== undefined ? { levelYear: held.levelYear } : {}),
      ...(held.regained ? { regained: true as const } : {}),
      ...(record ? { newRecord: isNewRecord(bars, held.crossedAt, record.price, sign) } : {}),
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

  return {
    kind: "crossing", direction, triggerPrice, stopPrice, pivot, level: pivot.price, reactionEntry, reactionStop,
    protectivePivot, held: false, crossedAt: null, swingDays, source: "swing", formedAt: bars[pivot.index].t,
  };
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
 * Only the second and third test are bought: after three bottoms at the
 * level there is no buy, since a fourth test is neither a double nor a triple
 * bottom. Bottoms count as the same level when within 3 points of it and
 * formed since a low last went more than 3 points under it, the margin by
 * which Gann says a bottom still holds (A-LEVELS-06).
 *
 * Engineering choices, labelled as such: the order is a limit at the level
 * (Gann says "buy at" the bottom and names no order type); the 3-point band
 * applies on both sides of the level; and the bottoms need no minimum time
 * apart. Gann describes them as "weeks, months or a year or more apart"
 * (A-ENTRY-02) without a floor, so any two completed swings of the 3-Day
 * Chart count. None of these moves the order or the stop.
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
  // The bottoms that make the double or triple bottom: those within 3 points
  // of the level since a low last went more than 3 points under it. A break
  // like that ends the old level (A-LEVELS-06: a low not 3 points under the
  // old lows shows support; one further under does not).
  let since = 0;
  for (let i = pivot.index - 1; i >= 0; i--) {
    if (sign * ((sign === 1 ? bars[i].l : bars[i].h) - reactionStop) < 0) {
      since = i + 1;
      break;
    }
  }
  const tests = own.filter((p) => p.index >= since && Math.abs(p.price - pivot.price) <= points).length;
  // Gann's buying points are the double and triple bottom, the second and
  // third test (A-ENTRY-02, -03). After three bottoms the order would buy a
  // fourth, which neither covers; his own note is that a fourth test usually
  // goes through (45 Years p.7, held as M-P6).
  if (tests >= 3) return null;
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
    source: "swing",
    formedAt: bars[pivot.index].t,
  };
}

/**
 * How long a bottom has to hold before the weeks form buys it: into its second
 * week. Gann says "2-3 weeks" (W006 p.20) and "1-3+ weeks" (Rule 3, pp.46-47);
 * `lib/gann/timeRules.ts` already reads "2-3 weeks" as days 8-21 on the
 * calendar, and the "+" keeps it a buy past day 21.
 */
export const HOLD_WEEKS_MIN_DAYS = 8;
/** "Once it holds 2-3 days" (W006 pp.46-47): the sessions since the low. */
export const HOLD_DAYS_MIN_SESSIONS = 2;
/** The bull-market reaction the days form buys after: "2-3 weeks", days 8-21 as in `timeRules.ts`. */
const BULL_REACTION_DAYS: [number, number] = [8, 21];
/**
 * "Holds its all-time low for weeks or months" (W006 p.24, A-ENTRY-10): four
 * weeks within 3 points of the record, counted from the day price came back
 * to it. The feature list's test for the rule reads "weeks" as 4+ weeks, a
 * reading rather than Gann's figure (step 4 review S2).
 */
export const HOLD_RECORD_MIN_DAYS = 28;

const DAY_MS = 86_400_000;
function calendarDays(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/** Within Gann's 5-point risk cap (W006 p.46, A-STOP-02), points price-scaled as at placement. */
function withinRiskCap(entry: number, stop: number): boolean {
  return Math.abs(entry - stop) <= (5 / 3) * gannThreePoints(entry) + 1e-9 * entry;
}

/**
 * A bottom that holds as a buying point (PLAN.md item 5, step 4). Gann:
 * "Single bottom: after a reaction, wait until it holds a level 2-3 weeks,
 * buy with a stop 3 points under the lowest week (2-3 days and the lowest day
 * in active markets)" (W006 pp.20, 46-47, A-ENTRY-01); "in bull markets
 * reactions last 2-3 weeks; buy after a 2-3 week reaction once it holds 2-3
 * days" (pp.46-47, A-ENTRY-08); "a stock holding its all-time low for weeks or
 * months without a 3-point break is a buy with a stop 3 points under" (p.24,
 * A-ENTRY-10). Shorts sell a single top that holds, stop 3 points above
 * (pp.22, 47, A-ENTRY-14; Rule 4 is Rule 3's mirror).
 *
 * The reaction is the move from the latest 3-Day Chart top that stands at
 * least 3 points over the low made since it; its low is the lowest week's
 * low and the lowest day's low alike, so one stop serves both forms. Three
 * forms, the record first when both apply (the older level, p.24):
 * - `record` (long only): the record low from before the 52 weeks, not broken
 *   by 3 points since, with price within 3 points of it for four weeks or
 *   more, counted from the day it came back there (`HOLD_RECORD_MIN_DAYS`).
 *   The stop is 3 points under the record, not under a dip less than 3 points
 *   through it (p.24: U.S. Steel ⅝ under its 1907 low, stop 3 under that low).
 * - `weeks`: the reaction's low has stood 8 calendar days or more.
 * - `days` (long only): the weekly chart is bullish, the reaction has run 8-21
 *   days (`readCounterMove`, read at the low), and its low has stood 2
 *   sessions. "Active markets" is read as A-ENTRY-08's own condition, a
 *   bull-market reaction: a rule reading, not Gann's words (review S5).
 *   The short side's days form is Rule 4's bear-rally sell (`bearRallySell`,
 *   step 4b), offered when no held top is.
 *
 * Engineering choices, labelled as such: Gann says "buy" and names no price,
 * so the order is a limit at the last completed session's close, the same
 * limit every other buying point uses. A reaction must reach 3 points, the
 * allowance under which Gann treats a move as noise. "Holds a level" is read
 * as no lower low (a lower one starts the count again). The buy is offered only
 * within Gann's 5-point risk cap, since Gann buys "near" the bottom (p.20);
 * further off it, the order at the old bottom (`computeGannOldLevelEntry`) is
 * the buy. A hold is bought once: after a session traded to the buy it offered,
 * the next hold needs a new low.
 *
 * Three-question basis: 1. Gann, as cited, Tier A. 2. The hold lengths are
 * durations Gann gives from observation, not a periodic cycle, so Dewey's
 * checklist does not apply; the replay's factor table is the test. 3. Rhythm
 * (a reaction that stops making new lows has run its normal length) and
 * Polarity, with the mirror only where Gann states it.
 */
export function computeGannHoldEntry(
  bars: Bar[],
  direction: TriggerDirection,
  older: OlderGannLevel[] = [],
  swingDays: number = ENTRY_TRIGGER_SWING_DAYS,
  /** The bear-market rally sale may be offered: the main trend is down (`bearRallySell`). */
  bearMarket = true,
): GannEntryTrigger | null {
  const found = holdEntryOn(bars, direction, older, swingDays, bearMarket);
  if (!found) return null;
  // Bought once (step 4 review S3): a session that offered this hold, and a
  // later one that traded to its buy, spend it. The next hold needs a new low,
  // as a crossing needs a new crossing and the replay a new pivot.
  const sign = direction === "bullish" ? 1 : -1;
  for (let j = found.since; j < bars.length - 1; j++) {
    const offered = holdEntryOn(bars.slice(0, j + 1), direction, older, swingDays, bearMarket);
    if (!offered || offered.trigger.formedAt !== found.trigger.formedAt) continue;
    const buy = offered.trigger.reactionEntry;
    if (bars.slice(j + 1).some((b) => sign * ((sign === 1 ? b.l : b.h) - buy) <= 0)) return null;
  }
  return found.trigger;
}

/** The hold on `bars` as of their last session, and the first session it could have been offered on. */
function holdEntryOn(
  bars: Bar[],
  direction: TriggerDirection,
  older: OlderGannLevel[],
  swingDays: number,
  bearMarket: boolean,
): { trigger: GannEntryTrigger; since: number } | null {
  if (bars.length === 0) return null;
  const sign = direction === "bullish" ? 1 : -1;
  const last = bars[bars.length - 1];
  const entry = last.c;
  const pivots = swingPivots(bars, swingDays);
  const bottom = direction === "bullish" ? "bottom" : "top";
  const extremeOf = (b: Bar) => (sign === 1 ? b.l : b.h);

  // The record low that held (A-ENTRY-10). Long only: Gann states it for lows,
  // and a record high is his "usually safe buy" (p.47), not a short.
  const record = direction === "bullish" ? older.find((l) => l.kind === "bottom" && l.source === "allTime") : undefined;
  if (record) {
    const points = gannThreePoints(record.price);
    const stop = record.price - points;
    const unbroken = bars.every((b) => b.l >= stop);
    // The stay near the record: from the day after price was last more than
    // 3 points over it (S2), not from an earlier visit in the 52 weeks.
    let stay = bars.length;
    while (stay > 0 && bars[stay - 1].l <= record.price + points) stay--;
    if (unbroken && stay < bars.length && calendarDays(bars[stay].t, last.t) >= HOLD_RECORD_MIN_DAYS && withinRiskCap(entry, stop)) {
      const pivot: SwingPivot = { index: -1, price: record.price, kind: "bottom" };
      const top = [...pivots].reverse().find((p) => p.kind === "top") ?? pivot;
      return {
        trigger: {
          kind: "hold", direction, triggerPrice: entry, stopPrice: stop, pivot, level: record.price,
          reactionEntry: entry, reactionStop: stop, protectivePivot: top, held: false, crossedAt: null,
          swingDays, source: "allTime", formedAt: record.formedAt, holdBasis: "record",
        },
        since: stay,
      };
    }
  }

  const swing = swingHold();
  if (swing || direction === "bullish") return swing;
  return bearMarket ? bearRallySell(bars, entry, swingDays) : null;

  function swingHold(): { trigger: GannEntryTrigger; since: number } | null {
    // The reaction: from the latest top that stands 3 points over the low since it.
    const tops = pivots.filter((p) => p.kind !== bottom);
    for (let k = tops.length - 1; k >= 0; k--) {
      const top = tops[k];
      let low = -1;
      for (let i = top.index + 1; i < bars.length; i++) {
        if (low < 0 || sign * (extremeOf(bars[i]) - extremeOf(bars[low])) < 0) low = i;
      }
      if (low < 0) continue;
      const level = extremeOf(bars[low]);
      if (sign * (top.price - level) < gannThreePoints(level)) continue;
      const stop = beyondByThreePoints(level, sign === 1 ? -1 : 1);
      if (!withinRiskCap(entry, stop)) return null;
      let holdBasis: "weeks" | "days" | null = null;
      if (calendarDays(bars[low].t, last.t) >= HOLD_WEEKS_MIN_DAYS) holdBasis = "weeks";
      else if (direction === "bullish" && bars.length - 1 - low >= HOLD_DAYS_MIN_SESSIONS) {
        // The reaction is read as it stood at its low, so a third day up that
        // turns the 3-Day Chart still holds (step 4 review S5, probe P7).
        // Timed from the reaction's top, not from a 3-day bounce inside it
        // (step 4b review R1).
        const cm = readCounterMove(bars.slice(0, low + 1));
        const move = counterMoveSince(bars.slice(0, low + 1));
        if (cm?.trend === "bullish" && cm.inCounterMove && move?.trend === "bullish" && withinReactionDays(move.days)) {
          holdBasis = "days";
        }
      }
      if (!holdBasis) return null;
      return {
        trigger: {
          kind: "hold", direction, triggerPrice: entry, stopPrice: stop, pivot: { index: low, price: level, kind: bottom },
          level, reactionEntry: entry, reactionStop: stop, protectivePivot: top, held: false, crossedAt: null,
          swingDays, source: "swing", formedAt: bars[low].t, holdBasis,
        },
        since: low + 1,
      };
    }
    return null;
  }
}

const withinReactionDays = (days: number) => days >= BULL_REACTION_DAYS[0] && days <= BULL_REACTION_DAYS[1];

/**
 * A counter-move against the weekly chart's trend, timed from where it began:
 * the trend's extreme since the weekly chart last turned against it (the
 * highest high since its last bottom in a bull market, the lowest low since
 * its last top in a bear market). A 3-Day Chart pullback inside the
 * counter-move does not restart its clock, and the move began at a bar
 * nothing since has gone beyond (step 4b review R1). Once the weekly chart
 * turns back with the trend, the counter-move is over: its start is then the
 * last session, and nothing is timed.
 */
function counterMoveSince(bars: Bar[]): { trend: "bullish" | "bearish"; start: number; days: number } | null {
  const weekly = walkSwingChart(bars, WEEKLY_SWING_CHART);
  if (weekly.trend === null || bars.length === 0) return null;
  const up = weekly.trend === "bullish";
  const turn = [...weekly.pivots].reverse().find((p) => p.kind === (up ? "bottom" : "top"));
  let start = turn?.index ?? 0;
  for (let i = start; i < bars.length; i++) if (up ? bars[i].h >= bars[start].h : bars[i].l <= bars[start].l) start = i;
  return { trend: weekly.trend, start, days: calendarDays(bars[start].t, bars[bars.length - 1].t) };
}

/**
 * The bear-market rally sell (W006 p.47, Rule 4, A-ENTRY-18): "bear-market
 * rallies last 2-3 weeks; sell at the end of the second or third week with a
 * stop 3 points above the previous week's high". The bear market is the main
 * trend down: Gann's weighted trend over the monthly, weekly and daily charts
 * (A-TREND-01), which the caller passes as `bearMarket` (item 6 follow-up,
 * 2026-10-16; the weekly chart alone admitted rallies inside monthly
 * advances, which are bull-market reactions). The weekly chart is bearish
 * and the rally has run 8-21 days from its low ("2-3 weeks" read as in
 * `timeRules.ts`), the low being the lowest since the weekly chart's last top
 * (`counterMoveSince`). The sell is at the close of the week's last session,
 * with the stop 3 points over that week's high. One rally is sold once: a
 * sale at the end of its second week that traded spends the third.
 *
 * Engineering choices, labelled as such: the end of a week is a Friday
 * session (a week whose Friday is a holiday is not sold on this rule). "The
 * previous week" is read as the week just ended, since the order goes in
 * after it. The 8-21 days are calendar days, so the Fridays they allow depend
 * on the low's weekday: a Thursday low is sold 8 and 15 days on (after six
 * and eleven sessions), a Friday low 14 and 21 days on, not after its first
 * week. The rally must reach 3 points, Gann's noise allowance, and the stop
 * stays within his 5-point risk cap.
 *
 * Three-question basis: 1. Gann, Rule 4, Tier A. 2. A duration Gann gives
 * from observation, not a periodic cycle; Dewey's checklist does not apply
 * and the replay's factor table is the test. 3. Rhythm (a counter-move runs
 * its normal two or three weeks and ends) and Polarity: the mirror of the
 * days form, which Gann states for bull-market reactions.
 */
function bearRallySell(bars: Bar[], entry: number, swingDays: number): { trigger: GannEntryTrigger; since: number } | null {
  const last = bars[bars.length - 1];
  const day = (b: Bar) => Date.parse(`${b.t.slice(0, 10)}T00:00:00Z`);
  if (new Date(day(last)).getUTCDay() !== 5) return null;
  const move = counterMoveSince(bars);
  if (!move || move.trend !== "bearish" || move.start === bars.length - 1 || !withinReactionDays(move.days)) return null;
  const low = move.start;
  // The week: its sessions from Monday on.
  const monday = day(last) - 4 * DAY_MS;
  let first = bars.length - 1;
  while (first > 0 && day(bars[first - 1]) >= monday) first--;
  let top = first;
  for (let i = first; i < bars.length; i++) if (bars[i].h > bars[top].h) top = i;
  const level = bars[top].h;
  if (level - bars[low].l < gannThreePoints(bars[low].l)) return null;
  const stop = beyondByThreePoints(level, 1);
  if (!withinRiskCap(entry, stop)) return null;
  return {
    trigger: {
      kind: "hold", direction: "bearish", triggerPrice: entry, stopPrice: stop, pivot: { index: top, price: level, kind: "top" },
      level, reactionEntry: entry, reactionStop: stop, protectivePivot: { index: low, price: bars[low].l, kind: "bottom" },
      // The rally, not the week, is what a sale spends (R6).
      held: false, crossedAt: null, swingDays, source: "swing", formedAt: bars[low].t, holdBasis: "rally",
    },
    since: low + 1,
  };
}

/** The price a buying point fills at: the reaction buy, or the old level. */
function entryOf(t: GannEntryTrigger): number {
  // A crossing not yet made has to reach its 3-point line first.
  return t.kind === "crossing" && !t.held ? t.triggerPrice : t.reactionEntry;
}

/**
 * Of two buying points, the one nearer `price`: a set of resting orders is
 * filled by whichever price reaches first. When they are as near, the
 * crossing over the old level or the hold. Only one crossing ever competes
 * here; the older of two readings of one level is chosen where the crossing
 * is found (`latestCrossedLevel`, W006 p.24).
 */
export function nearerBuyingPoint(a: GannEntryTrigger, b: GannEntryTrigger, price: number): GannEntryTrigger {
  const da = Math.abs(entryOf(a) - price);
  const db = Math.abs(entryOf(b) - price);
  if (da !== db) return da < db ? a : b;
  return b.kind === "crossing" && a.kind !== "crossing" ? b : a;
}

/**
 * The buying point a plan is priced from: of the crossing, the old level and a
 * bottom that holds, the one nearer the price (PLAN.md item 5, steps 2 and 4).
 * Gann ranks none against the others; a set of resting orders is filled by
 * whichever price reaches first, which is the nearer one. On a tie, the
 * crossing. `older` adds the previous year's and the record levels to the
 * crossing (step 3) and the record low to the hold (step 4).
 */
export function selectGannEntry(
  bars: Bar[],
  direction: TriggerDirection,
  older: OlderGannLevel[] = [],
  swingDays: number = ENTRY_TRIGGER_SWING_DAYS,
  /** Whether the main trend is down, so a bear-market rally may be sold (`bearRallySell`). */
  bearMarket = true,
): GannEntryTrigger | null {
  const candidates = [
    computeGannEntryTrigger(bars, direction, swingDays, undefined, true, older),
    computeGannOldLevelEntry(bars, direction, swingDays),
    computeGannHoldEntry(bars, direction, older, swingDays, bearMarket),
  ].filter((t): t is GannEntryTrigger => t !== null);
  if (candidates.length === 0) return null;
  const price = bars[bars.length - 1].c;
  return candidates.reduce((a, b) => nearerBuyingPoint(a, b, price));
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
 * latest crossing is the live one. On the same close, the higher top for a
 * long, the nearer the price, and of two readings of one level (a previous
 * year's top that is also a swing top, `sameGannLevel`), the older (W006
 * p.24). Once that level is bought or broken, older ones are not revived.
 * The bar that crosses is not the reaction; the buy needs a later bar.
 *
 * A crossing is a close the chart shows going through the line, from a close
 * on the near side of it: a level the price already stood beyond when the 52
 * weeks began was crossed at a time the chart does not show, so it is not
 * bought on (step 3 review). A level broken after its crossing is crossed
 * again by the next close through its line, and that later crossing is the
 * one dated; a level only bought is not, so it is not offered twice.
 */
function latestCrossedLevel(
  bars: Bar[],
  pivots: SwingPivot[],
  direction: TriggerDirection,
  bufferPct?: number,
  older: OlderGannLevel[] = [],
): { pivot: SwingPivot; crossedAt: number; spent: boolean; source: GannLevelSource; formedAt: string; levelYear?: number; regained?: true } | null {
  const kind = direction === "bullish" ? "top" : "bottom";
  const sign = direction === "bullish" ? 1 : -1;
  type Candidate = { pivot: SwingPivot; from: number; source: GannLevelSource; formedAt: string; levelYear?: number; regained?: true };
  const candidates: Candidate[] = pivots
    .filter((p) => p.kind === kind)
    .map((p) => ({ pivot: p, from: p.index + 1, source: "swing" as const, formedAt: bars[p.index].t }));
  for (const l of older) {
    if (l.kind !== kind) continue;
    const from = bars.findIndex((b) => b.t.slice(0, 10) >= l.crossFrom);
    if (from >= 0) {
      candidates.push({
        pivot: { index: -1, price: l.price, kind }, from, source: l.source, formedAt: l.formedAt,
        ...(l.year !== undefined ? { levelYear: l.year } : {}),
      });
    }
  }
  // A regained old bottom (A-TREND-10, W006 p.30): "after a stock declines to
  // new low levels and then rallies back 3 points above the old bottom, it is
  // an indication that the decline is over". A bottom closed 3 points under
  // is crossed from below like a top, counted from the close that broke it
  // (fork F5 a: the crossing construct, an inference). The mirror, an old top
  // crossed and then lost by 3 points, is a sell (A-ENTRY-16's side).
  const opposite = direction === "bullish" ? "bottom" : "top";
  const brokenFrom = (from: number, level: number) => {
    const line = buffered(level, sign === 1 ? -1 : 1, bufferPct);
    for (let i = Math.max(from, 0); i < bars.length; i++) if (sign * (bars[i].c - line) <= 0) return i + 1;
    return -1;
  };
  for (const p of pivots) {
    if (p.kind !== opposite) continue;
    const from = brokenFrom(p.index + 1, p.price);
    if (from > 0) candidates.push({ pivot: p, from, source: "swing", formedAt: bars[p.index].t, regained: true });
  }
  for (const l of older) {
    if (l.kind !== opposite) continue;
    const start = bars.findIndex((b) => b.t.slice(0, 10) >= l.crossFrom);
    const from = start >= 0 ? brokenFrom(start, l.price) : -1;
    if (from > 0) {
      candidates.push({
        pivot: { index: -1, price: l.price, kind: opposite }, from, source: l.source, formedAt: l.formedAt,
        ...(l.year !== undefined ? { levelYear: l.year } : {}), regained: true,
      });
    }
  }
  let best: (Candidate & { crossedAt: number }) | null = null;
  for (const c of candidates) {
    const at = crossingOf(bars, c.from, c.pivot.price, sign, bufferPct);
    if (at < 0) continue;
    const same = best !== null && sameGannLevel(c.pivot.price, best.pivot.price);
    const better =
      !best ||
      at > best.crossedAt ||
      (at === best.crossedAt && (same ? c.formedAt < best.formedAt : sign * (c.pivot.price - best.pivot.price) > 0));
    if (better) best = { ...c, crossedAt: at };
  }
  if (!best) return null;
  const level = best.pivot.price;
  const points = Math.abs(buffered(level, sign, bufferPct) - level);
  const buy = level + (sign * points) / 3;
  const found = {
    pivot: best.pivot, crossedAt: best.crossedAt, source: best.source, formedAt: best.formedAt,
    ...(best.levelYear !== undefined ? { levelYear: best.levelYear } : {}),
    ...(best.regained ? { regained: true as const } : {}),
  };
  // Bought once a later bar trades to the buy. A close 3 points back through
  // the level (broken) always trades through the buy first, so this one test
  // covers both ends.
  for (let i = best.crossedAt + 1; i < bars.length; i++) {
    const b = bars[i];
    if (sign * ((sign === 1 ? b.l : b.h) - buy) <= 0) return { ...found, spent: true };
  }
  return { ...found, spent: false };
}

/**
 * The bar whose close crossed `level` by 3 points, from a close short of the
 * line, at or after `from`: the first such close, or the first after the
 * level was last broken (a close 3 points back through it). -1 when none.
 */
function crossingOf(bars: Bar[], from: number, level: number, sign: 1 | -1, bufferPct?: number): number {
  const line = buffered(level, sign, bufferPct);
  const broken = buffered(level, sign === 1 ? -1 : 1, bufferPct);
  let at = -1;
  // Looking for a crossing until one is found, then for the break that makes
  // the next crossing a new one. A level broken and not crossed again keeps
  // its last crossing, which is then spent. Price already beyond the line
  // when the count starts was crossed before it: only a break re-arms the
  // level, as after a crossing found here (step 4 review S4).
  const start = Math.max(from, 1);
  let looking = start - 1 >= bars.length || sign * (bars[start - 1].c - line) < 0;
  for (let i = start; i < bars.length; i++) {
    const c = bars[i].c;
    if (!looking) {
      if (sign * (c - broken) <= 0) looking = true;
      continue;
    }
    if (sign * (c - line) >= 0 && sign * (bars[i - 1].c - line) < 0) {
      at = i;
      looking = false;
    }
  }
  return at;
}

/** Whether any close from `from` on is at or beyond `line` (in the direction of `sign`). */
function closedThrough(bars: Bar[], from: number, line: number, sign: 1 | -1): boolean {
  for (let i = Math.max(from, 0); i < bars.length; i++) if (sign * (bars[i].c - line) >= 0) return true;
  return false;
}

/**
 * Two readings of one level: prices within a cent, or 0.1% on a large price
 * (step 3 review R11). The monthly chart's high and the daily chart's swing
 * high of one top can differ by a cent of feed aggregation or split rounding.
 */
export function sameGannLevel(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, 0.001 * Math.max(Math.abs(a), Math.abs(b)));
}

/** Whether the close at `at` is beyond every earlier high (low for a short) and the record. */
function isNewRecord(bars: Bar[], at: number, record: number, sign: 1 | -1): boolean {
  const close = bars[at].c;
  if (sign * (close - record) <= 0) return false;
  for (let i = 0; i < at; i++) if (sign * (close - (sign === 1 ? bars[i].h : bars[i].l)) <= 0) return false;
  return true;
}

/**
 * How many calendar years of the monthly chart the older levels are read from,
 * before `asOf`'s year, on every surface (step 3 review R10). Gann reads old
 * tops years back (W006 p.24); the span is an engineering choice, so the live
 * scan, the replay, confirmation, the live exit and the exam all agree on the
 * record whatever each fetched. The free feed may hold less.
 */
export const OLDER_LEVELS_YEARS = 10;

/**
 * Every previous calendar year's top and bottom, and the record top and
 * bottom before the 52 weeks the 3-Day Chart is read from, from monthly bars
 * (PLAN.md item 5, step 3; W006 pp.20, 22, 24, 47). Gann's rule is "a
 * previous year", so each year in the span counts, not only the last (step 3
 * review R9), each crossable by closes from the first day after its year
 * ends, and still a level after the next New Year (R1). The record first,
 * then the years, most recent first. Only years before `asOf`'s (YYYY-MM-DD) and months
 * before the 52 weeks are read, so neither the month still forming nor any
 * later month a replay holds can count. The record is crossable by closes
 * from `windowFrom`, the first day of the 52 weeks. The days of the month
 * holding `windowFrom` that fall before it are read by neither: an
 * engineering limit of joining a monthly chart to a daily one, documented
 * rather than hidden.
 */
export function olderGannLevels(monthly: Bar[], asOf: string, windowFrom: string): OlderGannLevel[] {
  const year = Number(asOf.slice(0, 4));
  const first = `${year - OLDER_LEVELS_YEARS}-01`;
  const span = monthly.filter((b) => b.t.slice(0, 7) >= first);
  const out: OlderGannLevel[] = [];
  const extremes = (months: Bar[], source: OlderGannLevel["source"], crossFrom: string, y?: number) => {
    if (months.length === 0) return;
    const top = months.reduce((a, b) => (b.h > a.h ? b : a));
    const bottom = months.reduce((a, b) => (b.l < a.l ? b : a));
    const tag = y !== undefined ? { year: y } : {};
    out.push(
      { price: top.h, kind: "top", source, ...tag, formedAt: top.t, crossFrom },
      { price: bottom.l, kind: "bottom", source, ...tag, formedAt: bottom.t, crossFrom },
    );
  };
  // The record first: a year's top that is also the record reads as the record.
  extremes(span.filter((b) => b.t.slice(0, 7) < windowFrom.slice(0, 7)), "allTime", windowFrom);
  for (let y = year - 1; y >= year - OLDER_LEVELS_YEARS; y--) {
    extremes(span.filter((b) => b.t.slice(0, 4) === String(y)), "priorYear", `${y + 1}-01-01`, y);
  }
  return out;
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

/**
 * The level a crossing entry crosses, recovered from the protocol's reaction
 * pair (`gannCrossedLevel`), or null for an entry that rests at its level.
 * Callers pass only the protocol's own stop, never one a person typed.
 */
export function protocolCrossedLevel(entry: number, protocolStop: number | null | undefined, kind: GannEntryKind | undefined): number | null {
  if (protocolStop == null || restsWithoutCrossing(kind)) return null;
  return gannCrossedLevel(entry, protocolStop);
}
