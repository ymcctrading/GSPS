/**
 * Indicator math for Strategy Modes only — deliberately separate from
 * `lib/indicators.ts`, which is the display-only chart-overlay family whose
 * own header states it "must never feed a scored criterion, a signal gate, a
 * trade plan, or any verdict this platform issues." That invariant only
 * holds if nothing which *does* feed a trade plan imports it. Strategy Modes
 * intentionally do feed a (non-Gann, opt-in, human-selected) trade plan, so
 * they get their own copy of the same well-known formulas rather than
 * reaching into the display module and quietly invalidating its guarantee.
 *
 * All functions here take closed `Bar[]` (oldest first) and return arrays
 * aligned to the input by index, or a plain number/point for the latest
 * value. Nothing here is a scored criterion or a display series — it exists
 * solely to compute entry/stop/target levels for `lib/strategies/*`.
 */

import type { Bar } from "@/lib/types";

export function sma(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period <= 0 || bars.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += bars[i].c;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = bars[i].c * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].c - bars[i - 1].c;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  const rsiFrom = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

export interface MacdPoint {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(bars: Bar[], fast = 12, slow = 26, signalPeriod = 9): (MacdPoint | null)[] {
  const out: (MacdPoint | null)[] = new Array(bars.length).fill(null);
  if (bars.length < slow + signalPeriod) return out;
  const fastEma = ema(bars, fast);
  const slowEma = ema(bars, slow);
  const macdLine: (number | null)[] = bars.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? (fastEma[i] as number) - (slowEma[i] as number) : null,
  );
  // Signal = EMA(signalPeriod) of the MACD line, seeded once it's fully defined.
  const firstDefined = macdLine.findIndex((v) => v != null);
  if (firstDefined === -1 || bars.length - firstDefined < signalPeriod) return out;
  const k = 2 / (signalPeriod + 1);
  let seed = 0;
  for (let i = firstDefined; i < firstDefined + signalPeriod; i++) seed += macdLine[i] as number;
  seed /= signalPeriod;
  let signal = seed;
  const signalStart = firstDefined + signalPeriod - 1;
  out[signalStart] = { macd: macdLine[signalStart] as number, signal, histogram: (macdLine[signalStart] as number) - signal };
  for (let i = signalStart + 1; i < bars.length; i++) {
    const m = macdLine[i] as number;
    signal = m * k + signal * (1 - k);
    out[i] = { macd: m, signal, histogram: m - signal };
  }
  return out;
}

export interface BollingerPoint {
  upper: number;
  middle: number;
  lower: number;
}

export function bollinger(bars: Bar[], period = 20, mult = 2): (BollingerPoint | null)[] {
  const out: (BollingerPoint | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].c;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = bars[j].c - mean;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);
    out[i] = { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd };
  }
  return out;
}

function trueRange(bars: Bar[], i: number): number {
  if (i === 0) return bars[0].h - bars[0].l;
  const prevClose = bars[i - 1].c;
  return Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prevClose), Math.abs(bars[i].l - prevClose));
}

export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let avg = 0;
  for (let i = 0; i < period; i++) avg += trueRange(bars, i);
  avg /= period;
  out[period - 1] = avg;
  for (let i = period; i < bars.length; i++) {
    avg = (avg * (period - 1) + trueRange(bars, i)) / period;
    out[i] = avg;
  }
  return out;
}

export interface PsarPoint {
  value: number;
  trend: "up" | "down";
}

/** Wilder's Parabolic SAR. See this file's header — a Strategy Modes copy of
 * the same well-known formula `lib/indicators.ts#psar` renders for display. */
export function psar(bars: Bar[], step = 0.02, max = 0.2): (PsarPoint | null)[] {
  const out: (PsarPoint | null)[] = new Array(bars.length).fill(null);
  if (bars.length < 2) return out;

  let trend: "up" | "down" = bars[1].c >= bars[0].c ? "up" : "down";
  let af = step;
  let ep = trend === "up" ? bars[0].h : bars[0].l;
  let sarValue = trend === "up" ? bars[0].l : bars[0].h;

  for (let i = 1; i < bars.length; i++) {
    const prevLow1 = bars[i - 1].l;
    const prevHigh1 = bars[i - 1].h;
    const prevLow2 = i >= 2 ? bars[i - 2].l : prevLow1;
    const prevHigh2 = i >= 2 ? bars[i - 2].h : prevHigh1;

    let next = sarValue + af * (ep - sarValue);

    if (trend === "up") {
      next = Math.min(next, prevLow1, prevLow2);
      if (bars[i].l < next) {
        trend = "down";
        next = ep;
        ep = bars[i].l;
        af = step;
      } else if (bars[i].h > ep) {
        ep = bars[i].h;
        af = Math.min(af + step, max);
      }
    } else {
      next = Math.max(next, prevHigh1, prevHigh2);
      if (bars[i].h > next) {
        trend = "up";
        next = ep;
        ep = bars[i].h;
        af = step;
      } else if (bars[i].l < ep) {
        ep = bars[i].l;
        af = Math.min(af + step, max);
      }
    }

    sarValue = next;
    out[i] = { value: sarValue, trend };
  }

  return out;
}

export interface SupertrendPoint {
  value: number;
  trend: "up" | "down";
}

/** ATR-band stop-and-reverse. See this file's header. */
export function supertrend(bars: Bar[], period = 10, multiplier = 3): (SupertrendPoint | null)[] {
  const out: (SupertrendPoint | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const atrSeries = atr(bars, period);

  let finalUpper = 0;
  let finalLower = 0;
  let trend: "up" | "down" = "up";
  let prevIndex = -1;

  for (let i = period - 1; i < bars.length; i++) {
    const a = atrSeries[i];
    if (a == null) continue;
    const mid = (bars[i].h + bars[i].l) / 2;
    const basicUpper = mid + multiplier * a;
    const basicLower = mid - multiplier * a;

    if (prevIndex === -1) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      trend = bars[i].c <= finalUpper ? "down" : "up";
    } else {
      const prevClose = bars[prevIndex].c;
      finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
      if (trend === "down" && bars[i].c > finalUpper) trend = "up";
      else if (trend === "up" && bars[i].c < finalLower) trend = "down";
    }

    out[i] = { value: trend === "up" ? finalLower : finalUpper, trend };
    prevIndex = i;
  }

  return out;
}

/** Lowest low / highest high over the trailing `lookback` closed bars ending
 * at (and including) index `i` — a simple, shared "recent swing" stop
 * reference for the strategy modes that need one. */
export function recentLow(bars: Bar[], i: number, lookback: number): number {
  const start = Math.max(0, i - lookback + 1);
  let low = Infinity;
  for (let j = start; j <= i; j++) low = Math.min(low, bars[j].l);
  return low;
}

export function recentHigh(bars: Bar[], i: number, lookback: number): number {
  const start = Math.max(0, i - lookback + 1);
  let high = -Infinity;
  for (let j = start; j <= i; j++) high = Math.max(high, bars[j].h);
  return high;
}

/**
 * Session-anchored VWAP: cumulative (typical price × volume) / cumulative
 * volume from the start of `bars`. Callers pass one session's worth of
 * intraday bars (the anchor point) — this function has no notion of a
 * calendar day itself, matching the convention every other Strategy Modes
 * function uses of taking exactly the bars the caller wants evaluated.
 */
export function vwap(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let cumPV = 0;
  let cumVolume = 0;
  for (let i = 0; i < bars.length; i++) {
    const typicalPrice = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumPV += typicalPrice * bars[i].v;
    cumVolume += bars[i].v;
    out[i] = cumVolume > 0 ? cumPV / cumVolume : null;
  }
  return out;
}

export interface StochasticPoint {
  k: number;
  d: number;
}

/** Stochastic oscillator: %K is the close's position within the trailing
 * `period`-bar high/low range (smoothed by `kSmooth`), %D is a further SMA
 * of %K. Standard (14, 3, 3). */
export function stochastic(
  bars: Bar[],
  period = 14,
  kSmooth = 3,
  dSmooth = 3,
): (StochasticPoint | null)[] {
  const out: (StochasticPoint | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period) return out;

  const rawK: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    const high = recentHigh(bars, i, period);
    const low = recentLow(bars, i, period);
    rawK[i] = high === low ? 50 : ((bars[i].c - low) / (high - low)) * 100;
  }

  // %K is itself smoothed by an SMA of the raw %K series (kSmooth).
  const smoothedK: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1 + kSmooth - 1) continue;
    let sum = 0;
    let count = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      if (rawK[j] == null) continue;
      sum += rawK[j] as number;
      count++;
    }
    if (count === kSmooth) smoothedK[i] = sum / kSmooth;
  }

  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1 + kSmooth - 1 + dSmooth - 1) continue;
    let sum = 0;
    let count = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) {
      if (smoothedK[j] == null) continue;
      sum += smoothedK[j] as number;
      count++;
    }
    if (count === dSmooth && smoothedK[i] != null) {
      out[i] = { k: smoothedK[i] as number, d: sum / dSmooth };
    }
  }

  return out;
}

export interface DonchianPoint {
  upper: number;
  lower: number;
  middle: number;
}

/** Donchian channel: highest high / lowest low over the trailing `period`
 * bars EXCLUDING the current one — the classic turtle-style breakout
 * reference, where the current bar is judged against the channel that
 * existed before it, not one that already includes it. */
export function donchian(bars: Bar[], period = 20): (DonchianPoint | null)[] {
  const out: (DonchianPoint | null)[] = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    const upper = recentHigh(bars, i - 1, period);
    const lower = recentLow(bars, i - 1, period);
    out[i] = { upper, lower, middle: (upper + lower) / 2 };
  }
  return out;
}
