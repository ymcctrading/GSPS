/**
 * Three angle readings from the Master Course, context only. Nothing here
 * feeds a scored criterion, a gate, a plan, the S/R list or an order; the
 * scored `gannAngleSlope` and the price-per-period scale (C-LEVELS-02) are
 * untouched, since both need a replay first.
 *
 * - C-LEVELS-04, angles from "0" (Master Course Ch.4 PDF 132-135, Form #7):
 *   a 45° line drawn up from zero at the time of a bottom (and of a top)
 *   reaches the bottom's price after as many periods as the bottom has
 *   points ("from a 20 low, the 45° from 0 reaches 20 in 20 periods"), which
 *   is where price and time balance. The 45° down from a top reaches zero the
 *   same way (PDF 135: "45° down to 0 and back up"). Read from the extreme
 *   low and high of the bars read.
 * - C-LEVELS-05, angles from each bottom of a double or triple bottom (PDF 132,
 *   Form #6): the 45° from "1B" crosses the 2x1 from "2B" (and from "3B"), and
 *   the crossing is a point to watch. Tops mirror. The tests are the 3-Day
 *   Chart's swings within 3 points of the level `multipleTops.ts` reports, so
 *   both read the same double bottom.
 * - C-LEVELS-09, the 1x1 first (PDF 125: "first and always most important";
 *   PDF 55: "draw the 45° first, then the 2x1s, then 4x1 and 8x1"), ranked by
 *   `fans.ts#angleRank`; and the square of the latest swing's range (Ch.13 PDF
 *   377-379, the calculator's squares; Ch.16 PDF 428: "the crossing of two
 *   right angles is very important"). The 45°s from the square's two left
 *   corners cross at its centre, the midpoint's two 45°s cross the corner
 *   angles at the quarters, and the square closes when time has run as many
 *   periods as the range has points.
 *
 * Engineering choices, labelled as such: the unit is the Gann point per daily
 * bar (`fans.ts#angleUnit`, owner Q27); "on" a line is within Gann's 3 points
 * (`pointScale.ts`, his "never more than 3 points away" stop on the 45°, PDF
 * 125); the square of the range starts at the swing's first pivot; "at" a
 * crossing is within one bar. Gann gives the angles and the crossings, not
 * these tolerances.
 *
 * No date ahead is shown to a person ("Forward-looking claims"): the readings
 * carry bar offsets for the backtest, and the card only says when price is on
 * a line or at a crossing now.
 *
 * Three-question basis:
 * 1. Gann: the Master Course pages above, Tier A, confirmed in the reading
 *    notes (W023) on 2026-10-16.
 * 2. Cycles: the balance of price and time is a recurrence claim about one
 *    series; Dewey's checklist does not clear on it here, so it stays context
 *    and is measured.
 * 3. Hermetic: Correspondence (price and time squared, the same unit on both
 *    axes) and Polarity (every line has its mirror from the top).
 */
import type { Bar } from "@/lib/types";
import { angleUnit, computeFanLines, fanAnchors, nearestFanLine } from "@/lib/gann/fans";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export interface AnglePoint {
  index: number;
  price: number;
}

export interface ZeroAngleLine {
  anchor: AnglePoint;
  /** The line's price on the latest bar. */
  lineNow: number;
  /** Bar where the line balances: reaches the bottom's price (up) or zero (down). */
  balanceIndex: number;
  /** Bars from the latest bar to the balance (negative once past). */
  barsToBalance: number;
}

/** A 45° from zero at `anchor`'s time (`sign` 1), or down from `anchor` to zero (`sign` -1). */
export function zeroAngle(anchor: AnglePoint, unit: number, lastIndex: number, sign: 1 | -1): ZeroAngleLine {
  const elapsed = lastIndex - anchor.index;
  const lineNow = sign === 1 ? unit * elapsed : anchor.price - unit * elapsed;
  const balanceIndex = anchor.index + anchor.price / unit;
  return { anchor, lineNow, balanceIndex, barsToBalance: balanceIndex - lastIndex };
}

export interface MultipleTestCrossing {
  from: AnglePoint;
  to: AnglePoint;
  /** Fractional bar index of the crossing. */
  index: number;
  price: number;
}

/**
 * The 1x1 from an earlier test crossing the 2x1 from a later one: rising from
 * bottoms (`sign` 1), falling from tops (-1). Null when they meet before the
 * later test.
 */
export function multipleTestCrossing(a: AnglePoint, b: AnglePoint, unit: number, sign: 1 | -1): MultipleTestCrossing | null {
  // a + s·u·(t − ia) = b + 2·s·u·(t − ib)
  const index = (a.price - b.price) / (sign * unit) - a.index + 2 * b.index;
  if (!(index >= b.index)) return null;
  return { from: a, to: b, index, price: a.price + sign * unit * (index - a.index) };
}

export interface SquareOfRange {
  low: AnglePoint;
  high: AnglePoint;
  startIndex: number;
  endIndex: number;
  crossings: AnglePoint[];
  /** Price within 3 points of one of the four angles (two corners, the midpoint's two) on the latest bar. */
  onAngle: (price: number) => boolean;
}

/** The square of a swing's range in time, its corner and midpoint 45°s, and their crossings. */
export function squareOfRangeCrossings(low: AnglePoint, high: AnglePoint, unit: number, lastIndex: number): SquareOfRange {
  const startIndex = Math.min(low.index, high.index);
  const range = high.price - low.price;
  const side = range / unit;
  const mid = (low.price + high.price) / 2;
  const crossings: AnglePoint[] = [
    { index: startIndex + side / 4, price: low.price + range / 4 },
    { index: startIndex + side / 4, price: high.price - range / 4 },
    { index: startIndex + side / 2, price: mid },
  ];
  const e = lastIndex - startIndex;
  const lines = [low.price + unit * e, high.price - unit * e, mid + unit * e, mid - unit * e];
  return {
    low,
    high,
    startIndex,
    endIndex: startIndex + side,
    crossings,
    onAngle: (price) => lines.some((l) => Math.abs(l - price) <= gannThreePoints(price)),
  };
}

export interface AngleCrossingsReading {
  fromZero: { bottom: ZeroAngleLine | null; topUp: ZeroAngleLine | null; topDown: ZeroAngleLine | null; onLine: boolean; atBalance: boolean };
  multipleTests: { kind: "top" | "bottom"; tests: number; crossings: MultipleTestCrossing[]; onAngle: boolean; atCrossing: boolean } | null;
  square: { startIndex: number; endIndex: number; onAngle: boolean; atCrossing: boolean; atEnd: boolean } | null;
  /** Rank (`angleRank`) of the fan line price is on, within 1.5%; null when on none. */
  nearestAngleRank: number | null;
}

/** Engineering choice: "at" a crossing or balance is within one bar of it. */
const AT_BARS = 1;

export function readAngleCrossings(daily: Bar[], price: number): AngleCrossingsReading {
  const out: AngleCrossingsReading = {
    fromZero: { bottom: null, topUp: null, topDown: null, onLine: false, atBalance: false },
    multipleTests: null,
    square: null,
    nearestAngleRank: null,
  };
  if (daily.length < 20 || !(price > 0)) return out;
  const unit = angleUnit(daily);
  if (!(unit > 0)) return out;
  const last = daily.length - 1;
  const near = (x: number) => Math.abs(x - price) <= gannThreePoints(price);
  const at = (i: number) => Math.abs(i - last) <= AT_BARS;

  // C-LEVELS-04, from the extreme low and high of the bars read.
  let lo = 0;
  let hi = 0;
  daily.forEach((b, i) => {
    if (b.l < daily[lo].l) lo = i;
    if (b.h > daily[hi].h) hi = i;
  });
  const bottom = zeroAngle({ index: lo, price: daily[lo].l }, unit, last, 1);
  const topUp = zeroAngle({ index: hi, price: daily[hi].h }, unit, last, 1);
  const topDown = zeroAngle({ index: hi, price: daily[hi].h }, unit, last, -1);
  const zeros = [bottom, topUp, topDown];
  out.fromZero = {
    bottom,
    topUp,
    topDown,
    onLine: zeros.some((z) => z.lineNow > 0 && near(z.lineNow)),
    atBalance: zeros.some((z) => at(z.balanceIndex)),
  };

  // C-LEVELS-05, on the double or triple bottom (top) multipleTops.ts reads.
  const mt = readMultipleTops(daily);
  const reading = mt.bottom ?? mt.top;
  if (reading) {
    const kind = reading.kind;
    const sign = kind === "bottom" ? 1 : -1;
    const tests = walkSwingChart(daily, THREE_DAY_CHART)
      .pivots.filter((p) => p.kind === kind && p.index <= reading.lastTestIndex && Math.abs(p.price - reading.level) <= gannThreePoints(reading.level))
      .slice(-reading.tests)
      .map((p) => ({ index: p.index, price: p.price }));
    const crossings: MultipleTestCrossing[] = [];
    for (let i = 0; i < tests.length; i++) {
      for (let j = i + 1; j < tests.length; j++) {
        const x = multipleTestCrossing(tests[i], tests[j], unit, sign);
        if (x) crossings.push(x);
      }
    }
    const linesNow = tests.flatMap((t) => [1, 2].map((r) => t.price + sign * r * unit * (last - t.index)));
    out.multipleTests = {
      kind,
      tests: tests.length,
      crossings,
      onAngle: linesNow.some((l) => l > 0 && near(l)),
      atCrossing: crossings.some((x) => at(x.index)),
    };
  }

  // C-LEVELS-09, the square of the latest swing's range.
  const anchors = fanAnchors(daily).filter((a) => a.preceding);
  const latest = anchors.sort((a, b) => b.anchor.index - a.anchor.index)[0];
  if (latest && latest.preceding) {
    const pts = [latest.anchor, latest.preceding].map((p) => ({ index: p.index, price: p.price, kind: p.kind }));
    const l = pts.find((p) => p.kind === "low");
    const h = pts.find((p) => p.kind === "high");
    if (l && h && h.price > l.price) {
      const s = squareOfRangeCrossings(l, h, unit, last);
      out.square = {
        startIndex: s.startIndex,
        endIndex: s.endIndex,
        onAngle: s.onAngle(price),
        atCrossing: s.crossings.some((c) => at(c.index)),
        atEnd: at(s.endIndex),
      };
    }
  }

  out.nearestAngleRank = nearestFanLine(computeFanLines(daily, price))?.rank ?? null;
  return out;
}

/** Card and trace lines: present state only, no date ahead. */
export function describeAngleCrossings(r: AngleCrossingsReading): string[] {
  const lines: string[] = [];
  if (r.fromZero.onLine) lines.push("Price is on a 45° angle drawn from zero at the extreme high or low.");
  if (r.fromZero.atBalance) lines.push("A 45° angle from zero has reached its balance: price and time are squared.");
  const m = r.multipleTests;
  if (m?.onAngle) lines.push(`Price is on a 1x1 or 2x1 angle from the ${m.tests === 3 ? "triple" : "double"} ${m.kind}.`);
  if (m?.atCrossing) lines.push(`Angles from the ${m.tests === 3 ? "triple" : "double"} ${m.kind}'s tests cross at this bar.`);
  if (r.square?.atCrossing) lines.push("Angles in the square of the latest range cross at this bar.");
  if (r.square?.atEnd) lines.push("Time has squared the latest range.");
  if (r.nearestAngleRank === 1) lines.push("The angle price is on is the 1x1, the most important.");
  return lines;
}
