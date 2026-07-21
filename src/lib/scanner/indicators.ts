/**
 * Pure technical-indicator helpers over an OHLCV series (oldest -> newest).
 * Deliberately dependency-free and unit-testable.
 */
import type { OHLCVBar } from "@/lib/marketData/types";
import type { Indicators } from "./types";

export function sma(values: number[], period: number): number {
  if (values.length < period) period = values.length;
  if (period === 0) return 0;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/** Average True Range over `period` bars. */
export function atr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prevClose = bars[i - 1].close;
    trs.push(
      Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prevClose),
        Math.abs(cur.low - prevClose)
      )
    );
  }
  return sma(trs, period);
}

/** Relative volume: latest bar volume vs. average of the prior `period` bars. */
export function rvol(bars: OHLCVBar[], period = 20): number {
  if (bars.length < 2) return 1;
  const last = bars[bars.length - 1].volume;
  const prior = bars.slice(-1 - period, -1).map((b) => b.volume);
  const avg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : last;
  return avg > 0 ? +(last / avg).toFixed(2) : 1;
}

/** Wilder-style RSI. */
export function rsi(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

/** z-score of the last close relative to the SMA band (std dev of closes). */
export function zScore(closes: number[], period = 20): number {
  const slice = closes.slice(-period);
  if (slice.length < 2) return 0;
  const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
  const variance =
    slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return +((slice[slice.length - 1] - mean) / std).toFixed(2);
}

export function computeIndicators(bars: OHLCVBar[]): Indicators {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1] ?? 0;
  const atr14 = atr(bars, 14);
  return {
    sma20: +sma(closes, 20).toFixed(4),
    atr14: +atr14.toFixed(4),
    atrPct: price > 0 ? +((atr14 / price) * 100).toFixed(2) : 0,
    rvol: rvol(bars, 20),
    rsi14: rsi(closes, 14),
    zScore: zScore(closes, 20),
  };
}
