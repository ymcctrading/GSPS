/**
 * Pure, dependency-free indicator SERIES for chart rendering (client-safe).
 * These return one value per input bar (with nulls where an indicator has no
 * value yet), so they align 1:1 with the candle array on screen.
 */
import type { OHLCVBar } from "@/lib/marketData/types";

/** Exponential moving average series. */
export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    prev = prev === null ? v : v * k + prev * (1 - k);
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

export interface MacdSeries {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

/** MACD(12,26,9). */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdSeries {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null
  );
  // Signal = EMA of the defined portion of the MACD line.
  const defined = macdLine.map((v) => (v === null ? 0 : v));
  const signalRaw = ema(defined, signalPeriod);
  const signal = macdLine.map((v, i) => (v === null ? null : signalRaw[i]));
  const histogram = macdLine.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  );
  return { macd: macdLine, signal, histogram };
}

/** Rolling Wilder RSI series. */
export function rsiSeries(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function closesOf(bars: OHLCVBar[]): number[] {
  return bars.map((b) => b.close);
}
