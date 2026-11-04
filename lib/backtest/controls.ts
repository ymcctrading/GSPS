/**
 * Controls a strategy's ledger is measured against (quant validation, slice
 * 1). Measurement only: nothing here changes a verdict, score, plan or order.
 *
 * A long-only trend rule run across 2021–2026 large caps can show a positive
 * mean R with no timing skill at all, because the stocks rose. Two controls
 * separate the two:
 *
 * 1. `randomEntryControl`: for every real campaign, a seeded random entry on
 *    the same symbol and side, within `windowSessions` sessions of the real
 *    entry, held the same number of sessions, with the same stop distance as
 *    a share of price and the same cost a share. Exit at the stop (at the open
 *    when it gaps through) or at the last held session's close. Same exposure,
 *    same risk unit, no timing. If the strategy beats this, its entries add
 *    something; if not, the result is the market's drift.
 * 2. `equalWeightBenchmark`: every member stock held equally each session (the
 *    passive comparator over the same point-in-time universe).
 *
 * Fills read only bars at or after the entry session (the open, then each
 * session's low/high/close), so there is no look-ahead inside a control trade.
 * Engineering choices, labelled: the ±21-session window (about a month), exit
 * at the close rather than the core's trailing structure, and that a stop and
 * a close on one bar read as the stop.
 *
 * Design basis (AGENTS.md mandate). Gann: none; the control strips his timing
 * out on purpose, to see what the timing is worth. Cycles: Dewey's base rate,
 * a hit rate means nothing without the rate chance gives. Hermetic: Polarity,
 * the rule is read against its opposite (no rule). Law of Creation: rule ⊗
 * market; the edge is only what the pair creates beyond the market alone.
 */

import { seededRandom } from "@/lib/backtest/selectionBias";

export interface ControlBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ControlSourceTrade {
  symbol: string;
  openedAt: string;
  entry: number;
  stop: number;
  barsHeld: number;
  side?: "long" | "short";
  direction?: "bullish" | "bearish";
}

export interface ControlTrade {
  symbol: string;
  openedAt: string;
  closedAt: string;
  entry: number;
  stop: number;
  side: "long" | "short";
  barsHeld: number;
  exitPrice: number;
  exitReason: "stop" | "held";
  rMultiple: number;
}

export interface RandomEntryOptions {
  seed?: number;
  windowSessions?: number;
  /** Round-trip cost a share, as the replay charges (default 0.02). */
  costPerShare?: number;
  /** Point-in-time membership; a draw on a session the stock wasn't a member is redrawn. */
  inUniverse?: (symbol: string, date: string) => boolean;
}

export interface RandomEntryResult {
  trades: ControlTrade[];
  /** Real campaigns with no usable draw (no bars, no member session in the window). */
  unmatched: number;
}

function sideOf(t: ControlSourceTrade): "long" | "short" {
  if (t.side) return t.side;
  return t.direction === "bearish" ? "short" : "long";
}

/** Index of the first bar whose session (UTC date) is on or after `iso`'s. */
function sessionIndex(bars: readonly ControlBar[], iso: string): number {
  const day = iso.slice(0, 10);
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t.slice(0, 10) < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** One control trade from session `i`, or null when the bars can't carry it. */
export function controlTradeAt(
  symbol: string,
  bars: readonly ControlBar[],
  i: number,
  side: "long" | "short",
  riskShare: number,
  held: number,
  costPerShare: number,
): ControlTrade | null {
  if (i < 0 || i >= bars.length || !(riskShare > 0) || !(held >= 1)) return null;
  const entry = bars[i].o;
  if (!(entry > 0)) return null;
  const dir = side === "long" ? 1 : -1;
  const perShare = entry * riskShare;
  const stop = entry - dir * perShare;
  const lastIdx = Math.min(bars.length - 1, i + held - 1);
  let exitPrice = bars[lastIdx].c;
  let exitIdx = lastIdx;
  let exitReason: "stop" | "held" = "held";
  for (let k = i; k <= lastIdx; k++) {
    const b = bars[k];
    // The entry bar's own open is the fill, so only a later open can gap through.
    if (k > i && dir * (b.o - stop) <= 0) {
      exitPrice = b.o;
      exitIdx = k;
      exitReason = "stop";
      break;
    }
    if (dir * ((dir === 1 ? b.l : b.h) - stop) <= 0) {
      exitPrice = stop;
      exitIdx = k;
      exitReason = "stop";
      break;
    }
  }
  const r = (dir * (exitPrice - entry) - costPerShare) / perShare;
  return { symbol, openedAt: bars[i].t, closedAt: bars[exitIdx].t, entry, stop, side, barsHeld: exitIdx - i + 1, exitPrice, exitReason, rMultiple: r };
}

/** One seeded draw of the matched random-entry control. */
export function randomEntryControl(
  trades: readonly ControlSourceTrade[],
  barsBySymbol: ReadonlyMap<string, readonly ControlBar[]>,
  { seed = 20261104, windowSessions = 21, costPerShare = 0.02, inUniverse }: RandomEntryOptions = {},
): RandomEntryResult {
  const rand = seededRandom(seed);
  const out: ControlTrade[] = [];
  let unmatched = 0;
  for (const t of trades) {
    const bars = barsBySymbol.get(t.symbol);
    const riskShare = t.entry > 0 ? Math.abs(t.entry - t.stop) / t.entry : NaN;
    const held = Math.max(1, Math.round(t.barsHeld));
    if (!bars || bars.length === 0 || !(riskShare > 0)) {
      unmatched++;
      continue;
    }
    const at = sessionIndex(bars, t.openedAt);
    const lo = Math.max(0, at - windowSessions);
    const hi = Math.min(bars.length - 1, at + windowSessions);
    const candidates: number[] = [];
    for (let k = lo; k <= hi; k++) if (!inUniverse || inUniverse(t.symbol, bars[k].t.slice(0, 10))) candidates.push(k);
    if (candidates.length === 0) {
      unmatched++;
      continue;
    }
    const pick = candidates[Math.floor(rand() * candidates.length)];
    const c = controlTradeAt(t.symbol, bars, pick, sideOf(t), riskShare, held, costPerShare);
    if (c) out.push(c);
    else unmatched++;
  }
  return { trades: out, unmatched };
}

export interface ControlDistribution {
  draws: number;
  means: number[];
  realMean: number;
  /** Share of control draws whose mean R is at or above the real mean (a one-sided permutation p). */
  shareAtOrAboveReal: number;
  p05: number;
  p50: number;
  p95: number;
}

/** Many seeded draws of the control, against the real ledger's mean R. */
export function randomEntryDistribution(
  trades: readonly (ControlSourceTrade & { rMultiple: number })[],
  barsBySymbol: ReadonlyMap<string, readonly ControlBar[]>,
  draws: number,
  options: RandomEntryOptions = {},
): ControlDistribution {
  const realMean = trades.length > 0 ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : NaN;
  const base = options.seed ?? 20261104;
  const means: number[] = [];
  for (let d = 0; d < draws; d++) {
    const { trades: ct } = randomEntryControl(trades, barsBySymbol, { ...options, seed: base + d });
    if (ct.length > 0) means.push(ct.reduce((s, t) => s + t.rMultiple, 0) / ct.length);
  }
  const sorted = [...means].sort((a, b) => a - b);
  const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
  return {
    draws: means.length,
    means,
    realMean,
    // Add-one so a finite number of draws never reports p = 0.
    shareAtOrAboveReal: (means.filter((m) => m >= realMean).length + 1) / (means.length + 1),
    p05: q(0.05),
    p50: q(0.5),
    p95: q(0.95),
  };
}

/**
 * The equal-weight, daily-rebalanced return of every member stock with a
 * close on the session and the one before. Sessions are the union of the
 * symbols' bar dates.
 */
export function equalWeightBenchmark(
  barsBySymbol: ReadonlyMap<string, readonly ControlBar[]>,
  inUniverse?: (symbol: string, date: string) => boolean,
): Array<{ date: string; return: number; members: number }> {
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const [symbol, bars] of barsBySymbol) {
    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1].c;
      const cur = bars[i].c;
      const date = bars[i].t.slice(0, 10);
      if (!(prev > 0 && cur > 0)) continue;
      if (inUniverse && !inUniverse(symbol, date)) continue;
      const e = byDay.get(date) ?? { sum: 0, n: 0 };
      e.sum += cur / prev - 1;
      e.n++;
      byDay.set(date, e);
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, e]) => ({ date, return: e.sum / e.n, members: e.n }));
}
