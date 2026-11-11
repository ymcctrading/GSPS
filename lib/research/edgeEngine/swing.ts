/**
 * Section 1, the swing engine, on GSPS's own swing chart.
 *
 * The handoff's "trend indicator line" for 1-, 2- and 3-bar swings is Gann's
 * swing chart: the line follows higher tops up and, after N bars of lower
 * bottoms, moves down (*45 Years in Wall Street*, 1949, Ch. VII p.62; the
 * daily chart "records all reverse moves or reactions that run 2 to 3 days",
 * *How to Make Profits in Commodities*, 1951, p.316). That construction is
 * already built, Gann-faithful, in `lib/gann/swingChart.ts`, so this module
 * reuses it (cross-platform rule) rather than building a second one. One
 * difference from the handoff, recorded: an outside bar is not split into
 * "which extreme came first"; the walker reads it as extending the swing
 * when it makes the new extreme, Gann's own reading of a bar on a daily chart.
 *
 * What this adds: when each pivot became KNOWN (the bar whose close turned
 * the line), so no consumer reads a pivot before it existed; Gann's trend by
 * higher tops and bottoms; double/triple tops and bottoms; old tops turned
 * bottoms; and run statistics with the average-run projection.
 */
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import type { Bar } from "@/lib/types";

export interface Pivot {
  kind: "top" | "bottom";
  /** Bar index of the extreme. */
  index: number;
  price: number;
  /** Bar index at whose close the pivot became known (the line turned). */
  known: number;
}

export interface SwingWalk {
  pivots: Pivot[];
  /** Per bar: +1 when the line is up at that bar's close, -1 down, 0 before the first swing. */
  line: Int8Array;
  /** Bars at whose close the line turned up (a bottom became known). */
  turnsUp: number[];
  /** Bars at whose close the line turned down. */
  turnsDown: number[];
}

/** Walks an N-bar swing chart and records when each pivot became known. */
export function swingWalk(bars: Bar[], n: number | "weekly"): SwingWalk {
  const w = walkSwingChart(bars, n === "weekly" ? WEEKLY_SWING_CHART : n);
  const pivots: Pivot[] = [];
  const turnsUp: number[] = [];
  const turnsDown: number[] = [];
  // pivots[0] is the chart's origin, known when the first swing began (trendChanges[0]);
  // pivots[j], j >= 1, became known at reversals[j - 1].
  w.pivots.forEach((p, j) => {
    const known = j === 0 ? (w.trendChanges[0] ?? p.index) : w.reversals[j - 1];
    pivots.push({ kind: p.kind, index: p.index, price: p.price, known });
    if (j >= 1) (p.kind === "bottom" ? turnsUp : turnsDown).push(known);
  });
  const line = new Int8Array(bars.length);
  let dir = 0;
  let k = 0;
  const events = [...turnsUp.map((i) => [i, 1] as const), ...turnsDown.map((i) => [i, -1] as const)].sort((a, b) => a[0] - b[0]);
  // The first swing's own direction, from the origin's kind.
  if (pivots.length > 0) {
    const first = pivots[0];
    for (let i = first.known; i < bars.length; i++) line[i] = first.kind === "bottom" ? 1 : -1;
    dir = first.kind === "bottom" ? 1 : -1;
  }
  for (let i = 0; i < bars.length; i++) {
    while (k < events.length && events[k][0] === i) {
      dir = events[k][1];
      k++;
    }
    if (pivots.length > 0 && i >= pivots[0].known) line[i] = dir;
  }
  return { pivots, line, turnsUp, turnsDown };
}

/** Pivots known at or before bar `t`. */
export function knownPivots(pivots: Pivot[], t: number): Pivot[] {
  const out: Pivot[] = [];
  for (const p of pivots) if (p.known <= t) out.push(p);
  return out;
}

/**
 * Trend by Gann's swing rule: up after a higher top AND a higher bottom, down
 * after a lower top and a lower bottom, otherwise unchanged.
 */
export function swingTrend(known: Pivot[]): -1 | 0 | 1 {
  const tops = known.filter((p) => p.kind === "top");
  const bots = known.filter((p) => p.kind === "bottom");
  if (tops.length < 2 || bots.length < 2) return 0;
  const ht = tops[tops.length - 1].price > tops[tops.length - 2].price;
  const hb = bots[bots.length - 1].price > bots[bots.length - 2].price;
  const lt = tops[tops.length - 1].price < tops[tops.length - 2].price;
  const lb = bots[bots.length - 1].price < bots[bots.length - 2].price;
  if (ht && hb) return 1;
  if (lt && lb) return -1;
  return 0;
}

/**
 * Double and triple bottoms (tops): known pivots of the same kind within
 * `tolPct` of each other. Returns the level (the mean) and how many tests.
 * Gann: "buy near a single, double or triple bottom" (*New Stock Trend
 * Detector*, 1936, p.20); a triple bottom is "often the safest place"
 * (*45 Years in Wall Street*, p.7).
 */
export function multiples(known: Pivot[], kind: "top" | "bottom", tolPct: number, lookback = 8): { level: number; tests: number }[] {
  const same = known.filter((p) => p.kind === kind).slice(-lookback);
  const out: { level: number; tests: number }[] = [];
  for (let i = 0; i < same.length; i++) {
    const group = same.filter((q) => Math.abs(q.price - same[i].price) / same[i].price <= tolPct / 100);
    if (group.length >= 2) {
      const level = group.reduce((s, q) => s + q.price, 0) / group.length;
      if (!out.some((o) => Math.abs(o.level - level) / level <= tolPct / 100)) out.push({ level, tests: group.length });
    }
  }
  return out;
}

/**
 * "Old tops become bottoms": the last few tops price has since closed above
 * (support) and bottoms it has closed below (resistance).
 */
export function flipLevels(known: Pivot[], close: number, lookback = 8): { level: number; role: "support" | "resistance" }[] {
  const out: { level: number; role: "support" | "resistance" }[] = [];
  for (const p of known.slice(-lookback)) {
    if (p.kind === "top" && close > p.price) out.push({ level: p.price, role: "support" });
    if (p.kind === "bottom" && close < p.price) out.push({ level: p.price, role: "resistance" });
  }
  return out;
}

export interface RunStats {
  upBars: number;
  upPoints: number;
  downBars: number;
  downPoints: number;
  /** Projection from the last pivot by the average run, in time (bar index) and price. */
  projection: { index: number; price: number; from: Pivot } | null;
}

/** Average up and down runs over the last `lookback` runs, and the projection from the last pivot. */
export function runStats(known: Pivot[], lookback: number): RunStats {
  const ups: [number, number][] = [];
  const downs: [number, number][] = [];
  for (let i = 1; i < known.length; i++) {
    const a = known[i - 1];
    const b = known[i];
    const run: [number, number] = [b.index - a.index, Math.abs(b.price - a.price)];
    (b.kind === "top" ? ups : downs).push(run);
  }
  const avg = (r: [number, number][], j: 0 | 1) => {
    const s = r.slice(-lookback);
    return s.length ? s.reduce((x, y) => x + y[j], 0) / s.length : 0;
  };
  const st: RunStats = { upBars: avg(ups, 0), upPoints: avg(ups, 1), downBars: avg(downs, 0), downPoints: avg(downs, 1), projection: null };
  const last = known[known.length - 1];
  if (last && ups.length && downs.length) {
    st.projection =
      last.kind === "bottom"
        ? { index: Math.round(last.index + st.upBars), price: last.price + st.upPoints, from: last }
        : { index: Math.round(last.index + st.downBars), price: last.price - st.downPoints, from: last };
  }
  return st;
}
