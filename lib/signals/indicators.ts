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
 * Wilder's ADX/DMI over `period` bars. Returns the latest reading only — the
 * regime classifier needs "is a trend established right now", not a series.
 * `null` when there isn't enough history to seed Wilder's smoothing.
 */
export interface AdxReading {
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function adx(bars: Bar[], period = 14): AdxReading | null {
  if (bars.length < period * 2 + 1) return null;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const upMove = cur.h - prev.h;
    const downMove = prev.l - cur.l;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)));
  }

  const wilderSmooth = (values: number[]): number[] => {
    const out: number[] = [];
    let prevSum = values.slice(0, period).reduce((s, v) => s + v, 0);
    out.push(prevSum);
    for (let i = period; i < values.length; i++) {
      prevSum = prevSum - prevSum / period + values[i];
      out.push(prevSum);
    }
    return out;
  };

  const smoothedTr = wilderSmooth(trs);
  const smoothedPlusDM = wilderSmooth(plusDMs);
  const smoothedMinusDM = wilderSmooth(minusDMs);

  const dxSeries: number[] = [];
  for (let i = 0; i < smoothedTr.length; i++) {
    const tr = smoothedTr[i];
    if (tr === 0) {
      dxSeries.push(0);
      continue;
    }
    const plusDI = (100 * smoothedPlusDM[i]) / tr;
    const minusDI = (100 * smoothedMinusDM[i]) / tr;
    const diSum = plusDI + minusDI;
    dxSeries.push(diSum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / diSum);
  }

  if (dxSeries.length < period) return null;
  const adxValue = dxSeries.slice(-period).reduce((s, v) => s + v, 0) / period;

  const lastTr = smoothedTr[smoothedTr.length - 1];
  const plusDI = lastTr === 0 ? 0 : (100 * smoothedPlusDM[smoothedPlusDM.length - 1]) / lastTr;
  const minusDI = lastTr === 0 ? 0 : (100 * smoothedMinusDM[smoothedMinusDM.length - 1]) / lastTr;

  return { adx: adxValue, plusDI, minusDI };
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
