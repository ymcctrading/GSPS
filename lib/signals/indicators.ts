/**
 * Server-side indicator primitives for the Signal and Regime Engine.
 * Operates on `Bar[]` (o/h/l/c/v, ascending, closed bars only) — the same
 * shape the rest of `lib/strat` and `lib/scoring` use — rather than the
 * chart-facing `Candle[]` shape in `lib/indicators.ts`.
 */

import type { Bar } from "@/lib/types";
import { sma as smaLast } from "@/lib/analysis/pivots";

/** Full SMA series (not just the latest value) over `close`. */
export function smaSeries(bars: Bar[], period: number): number[] {
  if (period <= 0 || bars.length < period) return [];
  const closes = bars.map((b) => b.c);
  const out: number[] = [];
  for (let i = period; i <= closes.length; i++) {
    out.push(smaLast(closes.slice(0, i), period));
  }
  return out;
}

/**
 * Slope of a value series over the trailing `lookback` points, expressed as a
 * fraction of the series' own value (so it's comparable across instruments
 * and price levels). Positive = rising, negative = falling.
 */
export function slope(series: number[], lookback = 5): number {
  if (series.length < lookback + 1) return 0;
  const from = series[series.length - 1 - lookback];
  const to = series[series.length - 1];
  if (from === 0) return 0;
  return (to - from) / Math.abs(from) / lookback;
}

/**
 * VWAP anchored at `anchorIndex` (inclusive) through the end of `bars`. Uses
 * the typical price (h+l+c)/3, the standard VWAP convention.
 */
export function anchoredVwap(bars: Bar[], anchorIndex: number): number | null {
  if (anchorIndex < 0 || anchorIndex >= bars.length) return null;
  let pvSum = 0;
  let vSum = 0;
  for (let i = anchorIndex; i < bars.length; i++) {
    const typical = (bars[i].h + bars[i].l + bars[i].c) / 3;
    pvSum += typical * bars[i].v;
    vSum += bars[i].v;
  }
  return vSum === 0 ? null : pvSum / vSum;
}

/** Latest bar's volume relative to its own trailing average — "volume behavior". */
export function relativeVolume(bars: Bar[], lookback = 20): number | null {
  if (bars.length < lookback + 1) return null;
  const history = bars.slice(-lookback - 1, -1);
  const avg = history.reduce((s, b) => s + b.v, 0) / history.length;
  if (avg === 0) return null;
  return bars[bars.length - 1].v / avg;
}

/** True range of the latest bar, in multiples of the trailing ATR — flags abnormal expansion. */
export function lastRangeInAtrMultiples(bars: Bar[], atrValue: number): number {
  if (bars.length === 0 || atrValue === 0) return 0;
  const last = bars[bars.length - 1];
  return (last.h - last.l) / atrValue;
}
