/**
 * Gann's Overnight Chart and the mechanical trading method he built on it
 * (*Master Stock Market Course*, Ch. 3, "Method for Trading with the Overnight
 * Chart", pp. 68-116; Tier A). Built 2026-10-16 at the project owner's request
 * ("Build the 5 Gann plans identified to be missing").
 *
 * **The chart (p. 68).** A one-bar swing chart keyed on the lows, "because the
 * Overnight Chart is based on bottoms":
 * 1. While each day makes a higher bottom, the line moves up to that day's top.
 * 2. The first day the low breaks the previous day's bottom by ¼ point, the
 *    line moves down to that low, and the highest top reached is recorded.
 * 3. While it makes lower bottoms it keeps moving down.
 * 4. An inside day (higher bottom, lower top) moves it up to that day's top.
 * 5. An outside day (higher top, then lower bottom) moves it up to the high,
 *    then down to the low.
 *
 * **The method (pp. 68-71), as far as the text makes it mechanical:**
 * - Stops go 1 point beyond the last Overnight bottom (long) or top (short),
 *   and follow each new one ("thereafter 1-pt Overnight stops").
 * - **Rule 4:** when the stop is caught the chart has reversed, so reverse
 *   and "double up": the same order closes the long and opens a short of the
 *   same size. The exception: don't reverse where there is no nearby top or
 *   bottom to put the new stop against.
 * - **Rule 7:** after any big move, reverse on an Overnight change ("if it is
 *   time to sell out longs, it is also time to go short").
 * - Never risk more than 3 points on an initial trade. Read as a cap: the
 *   first stop goes 1 point beyond the last Overnight bottom (top), or 3
 *   points from the fill where that is nearer.
 * - The worked log buys and sells at the half-way point of the last swing,
 *   the "gravity center", with a 1-point stop. Read here as the halfway
 *   level, and as an optional entry in the system walk.
 *
 * **Not built, stated so nobody assumes it was:** Rule 7's panic trail (10
 * points from the market, then 5) waits on "panics" and "big pyramid
 * profits", which the text never defines; Rule 5's pyramiding is
 * `lib/gann/pyramid.ts`'s job. Rules 1-3 (double and triple tops, the 4th
 * test, ½ ⅔ ¾ levels) are read by `multipleTops.ts`, `disclosedRules.ts` and
 * `retracement.ts`.
 *
 * **Where it runs.** Context only on the live scan and the replay
 * (`disclosedRules.ts`, measured through `contextFactors.ts`). Gann's
 * stop-and-reverse system is measured on its own by
 * `lib/backtest/replayOvernight.ts`. Nothing here places, gates or reverses
 * an order: GSPS's own plans retire on a broken stop (`stopBreach.ts`) and
 * do not open the opposite trade. Making the reversal act on orders is a
 * production change for the owner, once the measurement exists.
 *
 * Engineering choices, labelled as such: Gann's "1 point" is a third of his
 * price-scaled 3 points (`pointScale.ts`), and "¼ point" a quarter of that;
 * "nearby" for Rule 4's exception is within his 3-point maximum initial risk;
 * an equal low neither turns the line nor breaks it.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A, his own course.
 * 2. Cycles: no periodicity claim. Dewey's checklist does not apply.
 * 3. Hermetic: Polarity (the same order that closes one side opens the
 *    other; "if it is time to sell out longs, it is also time to go short")
 *    and Rhythm (the line follows the market's own day-to-day swing).
 */

import type { Bar } from "@/lib/types";
import { gannPoint } from "@/lib/gann/pointScale";

export { gannPoint };

export interface OvernightPivot {
  index: number;
  price: number;
  kind: "top" | "bottom";
}

export interface OvernightState {
  line: "up" | "down" | null;
  /** Completed tops and bottoms, oldest first. */
  pivots: OvernightPivot[];
  /** Bar indices where the line turned. */
  turns: number[];
  /** The extreme of the swing in progress. */
  extreme: OvernightPivot | null;
}

/**
 * A stateful walker so the system and the replay can read the chart one bar at
 * a time without re-walking history. `point(price)` gives one point at a price;
 * the ¼-point filter is a quarter of it.
 */
export function createOvernightChart(point: (price: number) => number = gannPoint) {
  const s: OvernightState = { line: null, pivots: [], turns: [], extreme: null };
  let prev: Bar | null = null;
  let i = -1;

  const turn = (to: "up" | "down", next: OvernightPivot) => {
    if (s.extreme) s.pivots.push(s.extreme);
    s.line = to;
    s.extreme = next;
    s.turns.push(i);
  };

  return {
    state: s,
    push(b: Bar): OvernightState {
      i++;
      const p = prev;
      prev = b;
      if (!p) return s;
      const quarter = point(p.l) / 4;
      const higherBottom = b.l > p.l;
      const breaks = b.l <= p.l - quarter;
      const top: OvernightPivot = { index: i, price: b.h, kind: "top" };
      const bottom: OvernightPivot = { index: i, price: b.l, kind: "bottom" };

      if (s.line === null) {
        if (higherBottom) {
          s.extreme = { index: i - 1, price: p.l, kind: "bottom" };
          turn("up", top);
        } else if (breaks) {
          s.extreme = { index: i - 1, price: p.h, kind: "top" };
          turn("down", bottom);
        }
        return s;
      }

      // Rule 5: an outside day moves up to the high, then down to the low.
      if (b.h > p.h && breaks) {
        if (s.line === "up") {
          if (s.extreme && b.h > s.extreme.price) s.extreme = top;
        } else {
          turn("up", top);
        }
        turn("down", bottom);
        return s;
      }
      // Rules 1 and 4: a higher bottom (inside days included) moves it up.
      if (higherBottom) {
        if (s.line === "down") turn("up", top);
        else if (s.extreme && b.h > s.extreme.price) s.extreme = top;
        return s;
      }
      // Rule 2: a low ¼ point under the previous bottom turns it down.
      if (breaks && s.line === "up") {
        turn("down", bottom);
        return s;
      }
      // Rule 3, and a high above the swing on a day that neither turns nor breaks.
      if (s.line === "down" && s.extreme && b.l < s.extreme.price) s.extreme = bottom;
      if (s.line === "up" && s.extreme && b.h > s.extreme.price) s.extreme = top;
      return s;
    },
  };
}

export function walkOvernightChart(bars: Bar[], point?: (price: number) => number): OvernightState {
  const chart = createOvernightChart(point);
  for (const b of bars) chart.push(b);
  return chart.state;
}

function lastOf(pivots: OvernightPivot[], kind: "top" | "bottom"): OvernightPivot | null {
  for (let k = pivots.length - 1; k >= 0; k--) if (pivots[k].kind === kind) return pivots[k];
  return null;
}

// ---------------------------------------------------------------------------
// The mechanical method

export interface OvernightTrade {
  side: "long" | "short";
  entryIndex: number;
  entry: number;
  initialStop: number;
  exitIndex: number;
  exit: number;
  /** "reversed" when Rule 4 opened the opposite trade on the same fill. */
  reason: "reversed" | "stopped";
  /** How the trade was opened: a crossing, a Rule 4 reversal, or a halfway-point entry. */
  opened: "crossing" | "reversal" | "halfway";
}

export interface OvernightSystemOptions {
  point?: (price: number) => number;
  /** Also buy (sell) at the half-way point of the last up (down) swing with a 1-point stop, as the worked log does. */
  halfwayEntries?: boolean;
}

export interface OpenPosition {
  side: "long" | "short";
  entryIndex: number;
  entry: number;
  initialStop: number;
  stop: number;
  opened: OvernightTrade["opened"];
}

export interface OvernightSystemWalk {
  /** Closed trades. The one still open is `position`. */
  trades: OvernightTrade[];
  position: OpenPosition | null;
  chart: OvernightState;
}

/**
 * Walks Gann's Overnight method over the bars. Each bar is traded against the
 * chart as it stood at the previous close, so nothing peeks. Fills are at the
 * stop, or at the open when the market gaps through it.
 */
export function walkOvernightSystem(bars: Bar[], options: OvernightSystemOptions = {}): OvernightSystemWalk {
  const point = options.point ?? gannPoint;
  const chart = createOvernightChart(point);
  const trades: OvernightTrade[] = [];
  // A holder rather than a bare `let`, so the helpers below can change it.
  const st: { pos: OpenPosition | null } = { pos: null };

  const close = (i: number, exit: number, reason: OvernightTrade["reason"]) => {
    const p = st.pos;
    if (!p) return;
    trades.push({ side: p.side, entryIndex: p.entryIndex, entry: p.entry, initialStop: p.initialStop, exitIndex: i, exit, reason, opened: p.opened });
    st.pos = null;
  };
  const open = (side: "long" | "short", i: number, entry: number, stop: number, opened: OvernightTrade["opened"]) => {
    st.pos = { side, entryIndex: i, entry, initialStop: stop, stop, opened };
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const s = chart.state;
    const lastTop = lastOf(s.pivots, "top");
    const lastBottom = lastOf(s.pivots, "bottom");

    const p = st.pos;
    let stoppedOut = false;
    if (p) {
      const pt = point(p.entry);
      // Stops follow each new Overnight bottom (top), never back.
      if (p.side === "long" && lastBottom) p.stop = Math.max(p.stop, lastBottom.price - pt);
      if (p.side === "short" && lastTop) p.stop = Math.min(p.stop, lastTop.price + pt);
      const hit = p.side === "long" ? b.l <= p.stop : b.h >= p.stop;
      if (hit) {
        const fill = p.side === "long" ? Math.min(b.o, p.stop) : Math.max(b.o, p.stop);
        // Rule 4: reverse and double up, unless no nearby top (bottom) gives the new stop.
        const ref = p.side === "long" ? lastTop : lastBottom;
        const newStop = ref ? (p.side === "long" ? ref.price + pt : ref.price - pt) : null;
        const risk = newStop === null ? Infinity : p.side === "long" ? newStop - fill : fill - newStop;
        const reverse = risk > 0 && risk <= 3 * point(fill);
        close(i, fill, reverse ? "reversed" : "stopped");
        stoppedOut = !reverse;
        if (reverse && newStop !== null) open(p.side === "long" ? "short" : "long", i, fill, newStop, "reversal");
      }
    }

    // A stop caught without a reversal waits for the next bar.
    if (!st.pos && !stoppedOut && lastTop && lastBottom) {
      const ptTop = point(lastTop.price);
      const ptBottom = point(lastBottom.price);
      const buyAt = lastTop.price + ptTop;
      const sellAt = lastBottom.price - ptBottom;
      const buyFill = Math.max(b.o, buyAt);
      const sellFill = Math.min(b.o, sellAt);
      // Never more than 3 points of risk on an initial trade: the stop goes a
      // point beyond the last Overnight bottom (top), or 3 points from the fill
      // where that is nearer.
      const longStop = Math.max(lastBottom.price - ptBottom, buyFill - 3 * point(buyFill));
      const shortStop = Math.min(lastTop.price + ptTop, sellFill + 3 * point(sellFill));
      const buy = b.h >= buyAt;
      const sell = b.l <= sellAt;
      // Both on one bar: take the side the open was nearer, the one hit first.
      if (buy && (!sell || Math.abs(b.o - buyAt) <= Math.abs(b.o - sellAt))) {
        open("long", i, buyFill, longStop, "crossing");
      } else if (sell) {
        open("short", i, sellFill, shortStop, "crossing");
      } else if (options.halfwayEntries) {
        // The last completed swing: its two newest pivots.
        const [a, z] = s.pivots.slice(-2);
        if (a && z && a.kind !== z.kind) {
          const half = (a.price + z.price) / 2;
          const pt = point(half);
          const upSwing = z.kind === "top";
          if (upSwing && s.line === "down" && b.l <= half) open("long", i, Math.min(b.o, half), half - pt, "halfway");
          else if (!upSwing && s.line === "up" && b.h >= half) open("short", i, Math.max(b.o, half), half + pt, "halfway");
        }
      }
    }

    chart.push(b);
  }

  return { trades, position: st.pos ? { ...st.pos } : null, chart: chart.state };
}

/** A trade's result in multiples of its initial risk, before costs. */
export function overnightTradeR(t: OvernightTrade, costPerShare = 0): number | null {
  const risk = Math.abs(t.entry - t.initialStop);
  if (!(risk > 0)) return null;
  const gross = t.side === "long" ? t.exit - t.entry : t.entry - t.exit;
  return (gross - costPerShare) / risk;
}

// ---------------------------------------------------------------------------
// The reading the scan and the replay attach to a setup

export interface OvernightReading {
  line: "up" | "down";
  /** The line turned on the latest bar. */
  turnedToday: boolean;
  lastTop: number | null;
  lastBottom: number | null;
  /** One point at the current price. */
  point: number;
  /** 1 point under the last Overnight bottom: where a long's stop belongs. */
  longStop: number | null;
  /** 1 point over the last Overnight top. */
  shortStop: number | null;
  /** The half-way point of the last completed swing, and which way that swing ran. */
  halfway: { price: number; swing: "up" | "down" } | null;
  /** Gann's mechanical position as of the latest bar, if any. */
  system: "long" | "short" | null;
  /** The mechanical method reversed on the latest bar (Rule 4). */
  reversedToday: boolean;
}

export function readOvernightChart(bars: Bar[], point: (price: number) => number = gannPoint): OvernightReading | null {
  if (bars.length < 3) return null;
  const walk = walkOvernightSystem(bars, { point });
  const s = walk.chart;
  if (!s.line) return null;
  const lastIndex = bars.length - 1;
  const price = bars[lastIndex].c;
  const pt = point(price);
  const top = lastOf(s.pivots, "top");
  const bottom = lastOf(s.pivots, "bottom");
  const [a, z] = s.pivots.slice(-2);
  const lastTrade = walk.trades[walk.trades.length - 1];
  return {
    line: s.line,
    turnedToday: s.turns.includes(lastIndex),
    lastTop: top?.price ?? null,
    lastBottom: bottom?.price ?? null,
    point: pt,
    longStop: bottom ? bottom.price - point(bottom.price) : null,
    shortStop: top ? top.price + point(top.price) : null,
    halfway: a && z && a.kind !== z.kind ? { price: (a.price + z.price) / 2, swing: z.kind === "top" ? "up" : "down" } : null,
    system: walk.position?.side ?? null,
    reversedToday: lastTrade?.exitIndex === lastIndex && lastTrade.reason === "reversed",
  };
}

export function describeOvernightChart(r: OvernightReading): string[] {
  const lines = [
    `Overnight Chart ${r.turnedToday ? "turned" : "is"} ${r.line}${r.lastBottom !== null ? `; last bottom ${r.lastBottom.toFixed(2)}` : ""}${r.lastTop !== null ? `, last top ${r.lastTop.toFixed(2)}` : ""}. Stops go 1 point beyond them (${r.longStop?.toFixed(2) ?? "n/a"} for a long, ${r.shortStop?.toFixed(2) ?? "n/a"} for a short).`,
  ];
  if (r.halfway) lines.push(`Half-way point of the last ${r.halfway.swing} swing: ${r.halfway.price.toFixed(2)}, the method's buying (selling) level with a 1-point stop.`);
  if (r.reversedToday) lines.push(`The mechanical method's stop was caught today: it reverses to ${r.system}.`);
  return lines;
}
