/**
 * Gann's even figures (parity roadmap G, "Even figures (100, 200) attract
 * orders; place orders ½–¾ off them"), built 2026-09-28 by project-owner
 * direction.
 *
 * What Gann says (all Tier A; see `docs/memory-bank/sources/`):
 * - Even figures (100, 200, 300) attract selling orders (*Wall Street Stock
 *   Selector* Ch. I), and "100 is always the selling point" (Master Course,
 *   1933). Round numbers attract public selling (*45 Years in Wall Street*).
 * - The public thinks in 5s and 10s (25, 50, 75, 100, 150), so markets turn
 *   just short of round numbers (*How to Make Profits in Commodities* p. 19),
 *   and "even figures" are natural resistance points (p. 68).
 * - Buy or sell just *before* popular prices and even figures (*Stock
 *   Selector* Ch. V): place the order ½ to ¾ of a point off the figure.
 * - An old top of 100 crossed means a stop at 97 (*Stock Selector* Ch. V):
 *   the stop goes beyond the figure, not on it.
 *
 * How GSPS applies it:
 * - Figures are resistance and support: plan targets can sit just short of
 *   one (`targetCandidates`), and a stop that would rest on the near side of
 *   one is moved beyond it (`stopBeyondFigure`). `lib/strat/levels.ts`.
 * - A notice says when price is approaching one (`approachingFigure`), on the
 *   setup card, the chart and the order ticket, when the user has it on.
 * - The autonomous portfolio manager can be told not to auto-order into one
 *   unless the Gann plan itself supports the move (`roundNumberEntryBlocked`).
 * - A round number alone never makes a setup.
 * - The third time through (A-LEVELS-08, 2026-10-16): the first and second
 *   times an entry crosses a major figure, the buy is held to Watch
 *   (`readFigureCrossing`, `applyFigureCrossingHold` in `lib/scoring/score.ts`).
 *
 * Engineering choices, labelled as such (Gann gives the rule, not these
 * magnitudes for modern equities across $5–$1,000):
 * - The figure grid scales with price. The "unit" is the power of ten at or
 *   below the price (a $45 stock's unit is 10, a $150 stock's is 100). Major
 *   figures are multiples of the unit. Popular prices are quarters of it at
 *   $100 and above (25, 50, 75, as Gann lists) and halves below (the 5s).
 * - Orders go ¼ to ½ point inside the figure (*Wall Street Stock Selector*
 *   Ch.V; read in the long-book notes 2026-10-16). Taken as the middle of
 *   that band, `ORDER_OFFSET_POINTS` = ⅜ of a price-scaled point
 *   (`pointScale.ts`). Until 2026-10-16 it was ½ to ¾ point, read as 0.5% of
 *   the figure (M-P10). His 3 points beyond it is `pointScale.ts`'s
 *   price-scaled 3 points, the same figure the entry trigger uses.
 * - "Approaching" is within `APPROACH_WINDOW_PCT` of the figure.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Mentalism. The figures matter because the public prices in
 *    them, so orders gather there: the level is made by the crowd's mind, not
 *    by the chart. Correspondence explains why the grid scales with price: the
 *    same rule at every price level. The others don't fit: no rhythm or
 *    vibration is claimed, and the rule is symmetric only in the ordinary sense
 *    that support mirrors resistance.
 */

import { beyondByThreePoints, gannPoint } from "@/lib/gann/pointScale";
import type { Bar } from "@/lib/types";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";

/** ⅜ of a point: the middle of Gann's ¼ to ½ point inside an even figure. */
export const ORDER_OFFSET_POINTS = 0.375;
export const APPROACH_WINDOW_PCT = 2;

export type FigureKind = "major" | "popular";

export interface EvenFigure {
  price: number;
  kind: FigureKind;
}

function unitOf(price: number): number {
  return Math.pow(10, Math.floor(Math.log10(price)));
}

function stepOf(price: number): number {
  const unit = unitOf(price);
  return unit >= 100 ? unit / 4 : unit / 2;
}

const clean = (x: number) => Math.round(x * 1e6) / 1e6;

function kindOf(figure: number): FigureKind {
  const unit = unitOf(figure);
  return Math.abs(figure / unit - Math.round(figure / unit)) < 1e-9 ? "major" : "popular";
}

/** The nearest figure strictly above and strictly below a price. */
export function figuresAround(price: number): { above: EvenFigure | null; below: EvenFigure | null } {
  if (!(price > 0) || !Number.isFinite(price)) return { above: null, below: null };
  const step = stepOf(price);
  let up = clean(Math.floor(price / step) * step + step);
  let down = clean(Math.ceil(price / step) * step - step);
  // Crossing a power of ten changes the grid: 9.8's next figure is 10.
  if (up > 0 && unitOf(up) !== unitOf(price)) up = clean(unitOf(up));
  if (down <= 0) down = NaN;
  return {
    above: Number.isFinite(up) ? { price: up, kind: kindOf(up) } : null,
    below: Number.isFinite(down) ? { price: down, kind: kindOf(down) } : null,
  };
}

/** Every figure between two prices (exclusive), ascending. */
export function figuresBetween(a: number, b: number): EvenFigure[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: EvenFigure[] = [];
  let p = lo;
  for (let guard = 0; guard < 200; guard++) {
    const next = figuresAround(p).above;
    if (!next || next.price >= hi) break;
    out.push(next);
    p = next.price;
  }
  return out;
}

export interface ApproachReading {
  figure: EvenFigure;
  /** Distance from price to the figure, as % of price. */
  distancePct: number;
  side: "above" | "below";
  note: string;
}

/**
 * The figure price is approaching in the trade's direction, when one is within
 * the window. For a long that is the figure overhead (resistance), for a short
 * the one underneath (support).
 */
export function approachingFigure(price: number, direction: "bullish" | "bearish"): ApproachReading | null {
  const { above, below } = figuresAround(price);
  const figure = direction === "bullish" ? above : below;
  if (!figure) return null;
  const distancePct = (Math.abs(figure.price - price) / price) * 100;
  if (distancePct > APPROACH_WINDOW_PCT) return null;
  const side = direction === "bullish" ? "above" : "below";
  const at = `$${figure.price.toFixed(figure.price < 10 ? 2 : figure.price % 1 === 0 ? 0 : 2)}`;
  return {
    figure,
    distancePct,
    side,
    note:
      direction === "bullish"
        ? `Price is ${distancePct.toFixed(1)}% below ${at}, a round number. Selling orders tend to gather at round numbers, so rallies often stall just under them.`
        : `Price is ${distancePct.toFixed(1)}% above ${at}, a round number. Buying orders tend to gather at round numbers, so declines often stall just above them.`,
  };
}

/** Where an order resting at a figure belongs instead: just before it. */
export function shortOfFigure(figure: number, from: "below" | "above"): number {
  const off = ORDER_OFFSET_POINTS * gannPoint(figure);
  return from === "below" ? figure - off : figure + off;
}

/**
 * Target candidates from even figures between entry and a limit: each figure
 * contributes a price just before it, since markets turn just short of them.
 */
export function targetCandidates(entry: number, limit: number, direction: "bullish" | "bearish"): number[] {
  return figuresBetween(entry, limit)
    .filter((f) => f.kind === "major" || f.price >= 20)
    .map((f) => shortOfFigure(f.price, direction === "bullish" ? "below" : "above"))
    .filter((p) => (direction === "bullish" ? p > entry && p < limit : p < entry && p > limit));
}

/**
 * The even figure a structural level rests on, or the level itself. A support
 * (long) within `APPROACH_WINDOW_PCT` above a figure rests on that figure, so
 * the stop goes Gann's 3 points beyond the figure, once (2026-10-15: applying
 * the 3 points to the level and then again past the next figure stacked two
 * allowances). Mirror for resistance on a short.
 */
export function levelOnFigure(level: number, direction: "bullish" | "bearish"): number {
  const w = APPROACH_WINDOW_PCT / 100;
  const nudge = level * 1e-9;
  const near = direction === "bullish"
    ? figuresBetween(level * (1 - w), level + nudge).pop()
    : figuresBetween(level - nudge, level * (1 + w))[0];
  return near ? near.price : level;
}

/**
 * A stop resting just inside a figure is moved beyond it (Gann's old top of
 * 100 crossed, stop at 97): orders gather at the figure, so a long's stop at
 * 100.40 sits in the crowd, and belongs under 100 by Gann's 3 points,
 * price-scaled (about 5 at $100). A stop with no figure within `APPROACH_WINDOW_PCT` beyond it is
 * unchanged, as is one the move would take past `maxPct` from the entry.
 */
export function stopBeyondFigure(entry: number, stop: number, direction: "bullish" | "bearish", maxPct: number): number {
  const long = direction === "bullish";
  const w = APPROACH_WINDOW_PCT / 100;
  const nudge = stop * 1e-9;
  const near = long
    ? figuresBetween(stop * (1 - w), stop + nudge).pop()
    : figuresBetween(stop - nudge, stop * (1 + w))[0];
  if (!near) return stop;
  const moved = beyondByThreePoints(near.price, long ? -1 : 1);
  if (long ? moved >= stop : moved <= stop) return stop;
  return (Math.abs(entry - moved) / entry) * 100 <= maxPct ? moved : stop;
}

/**
 * The autonomous portfolio manager's round-number rule (owner, 2026-09-28): with
 * auto-ordering at round numbers off, an entry into a nearby figure is not
 * placed unless the Gann plan supports the move. A plan supports it when its
 * own trigger level (the old top or bottom it crosses) sits at the figure,
 * i.e. the breakout *is* the crossing of the round number (Gann's "old top of
 * 100 crossed").
 */
export function roundNumberEntryBlocked(input: {
  entry: number;
  direction: "bullish" | "bearish";
  /** The swing level the plan's trigger crosses, when known. */
  crossedLevel: number | null;
}): { blocked: boolean; note: string | null } {
  const reading = approachingFigure(input.entry, input.direction);
  if (!reading) return { blocked: false, note: null };
  const tol = reading.figure.price * (APPROACH_WINDOW_PCT / 100);
  const supported = input.crossedLevel !== null && Math.abs(input.crossedLevel - reading.figure.price) <= tol / 2;
  if (supported) return { blocked: false, note: null };
  return {
    blocked: true,
    note: `Not placed: the entry is just ${input.direction === "bullish" ? "under" : "over"} the round number $${reading.figure.price}, and the plan's breakout level isn't that number. Auto-ordering at round numbers is off in your settings.`,
  };
}

/**
 * Which time through a major figure an entry's crossing is (A-LEVELS-08).
 *
 * What Gann says (Tier A): "good selling always appears around the even
 * figures, like 100, 200 and 300" (*Wall Street Stock Selector* Ch. I). Above
 * 200, expect 202 to 203 and a 7 to 10 point break back, then buy the third
 * time through, for 210 or 225 (Ch. V). *Tunnel Thru the Air* (PDF 151, 166)
 * acts on it: Major Motors went above 200, was sold short near 203, and
 * "would not advance above 205½". So a crossing of an even figure the first
 * or second time is expected to fail just over it, and the third is bought.
 *
 * How GSPS reads it:
 * - The figure is a major one (`figuresAround`'s "major", the multiples of the
 *   price's power of ten: 100, 200 and 300 at Gann's prices, 40 or 50 at $45).
 * - The crossing goes through it when the figure lies between the crossed
 *   level, less one point, and the crossing line (the level plus 3 points):
 *   an old top at or just under 200 crossed by 3 points is a crossing of 200.
 *   Gann's 202 to 203 is one price-scaled point over 200 (`gannPoint(200)` is
 *   2.5), so a level within one point under the figure counts as at it.
 *   Engineering choice, labelled as such.
 * - A time through is a run of closes over the figure that began from a close
 *   under it. Each such run that has ended with a close back under is one
 *   time; the crossing being read is the next. Closes, not intraday highs, so
 *   a poke at the figure is not a time through. Engineering choice: Gann
 *   counts the times without saying how the chart marks one.
 * - The mirror, a short breaking a figure the third time, is the same rule
 *   turned over (Polarity; Gann gives the advance only, and "stops are run
 *   just under 100", Ch. V). Engineering symmetry, labelled as such.
 *
 * The bars are the daily chart the caller passes: the 52-week level chart on
 * both the live scan and the replay.
 */
export interface FigureCrossingReading {
  figure: number;
  direction: "bullish" | "bearish";
  /** 1 for the first time through, 2 for the second, 3 and up for the third and later. */
  time: number;
}

export const FIGURE_BUY_TIME = 3;

export function readFigureCrossing(
  daily: Pick<Bar, "c">[],
  crossing: { direction: "bullish" | "bearish"; level: number; triggerPrice: number },
): FigureCrossingReading | null {
  const { direction, level, triggerPrice } = crossing;
  if (!(level > 0) || !(triggerPrice > 0)) return null;
  const long = direction === "bullish";
  const point = gannPoint(level);
  const lo = long ? level - point : triggerPrice;
  const hi = long ? triggerPrice : level + point;
  const nudge = level * 1e-9;
  const figures = figuresBetween(lo - nudge, hi + nudge).filter((f) => f.kind === "major");
  if (figures.length === 0) return null;
  const figure = figures.reduce((a, b) => (Math.abs(b.price - level) < Math.abs(a.price - level) ? b : a)).price;
  const past = (c: number) => (long ? c > figure : c < figure);
  const short = (c: number) => (long ? c < figure : c > figure);
  let through = false;
  let completed = 0;
  for (let i = 1; i < daily.length; i++) {
    if (!through && short(daily[i - 1].c) && past(daily[i].c)) through = true;
    else if (through && short(daily[i].c)) {
      completed++;
      through = false;
    }
  }
  return { figure, direction, time: completed + 1 };
}

/**
 * `readFigureCrossing` for a plan's entry trigger, on the live scan and the
 * replay alike. An entry that rests at an old level (a double bottom, a
 * bottom that held) crosses nothing, so it reads null.
 */
export function figureCrossingOf(
  daily: Pick<Bar, "c">[],
  trigger: { kind: string; direction: "bullish" | "bearish"; level: number; triggerPrice: number } | null | undefined,
): FigureCrossingReading | null {
  if (!trigger || restsWithoutCrossing(trigger.kind)) return null;
  return readFigureCrossing(daily, trigger);
}
