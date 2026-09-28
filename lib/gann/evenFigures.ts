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
 *
 * Engineering choices, labelled as such (Gann gives the rule, not these
 * magnitudes for modern equities across $5–$1,000):
 * - The figure grid scales with price. The "unit" is the power of ten at or
 *   below the price (a $45 stock's unit is 10, a $150 stock's is 100). Major
 *   figures are multiples of the unit. Popular prices are quarters of it at
 *   $100 and above (25, 50, 75, as Gann lists) and halves below (the 5s).
 * - Gann's ½–¾ point off 100 is taken as `ORDER_OFFSET_PCT` = 0.5% of the
 *   figure; his 3 points beyond it is the codebase's lost-motion allowance,
 *   the same one the entry trigger uses.
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

import { LOST_MOTION_BUFFER_PCT } from "@/lib/gann/entryTrigger";

export const ORDER_OFFSET_PCT = 0.5;
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
  const off = figure * (ORDER_OFFSET_PCT / 100);
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
 * A stop resting just inside a figure is moved beyond it (Gann's old top of
 * 100 crossed, stop at 97): orders gather at the figure, so a long's stop at
 * 100.40 sits in the crowd, and belongs under 100 by the lost-motion
 * allowance. A stop with no figure within `APPROACH_WINDOW_PCT` beyond it is
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
  const a = LOST_MOTION_BUFFER_PCT / 100;
  const moved = long ? near.price * (1 - a) : near.price * (1 + a);
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
