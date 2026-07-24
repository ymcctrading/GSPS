/** Technical indicators: MACD, RSI, and helpers */

export interface Indicator {
  timestamp: number;
  value: number;
  signal?: number;
  histogram?: number;
}

/**
 * Calculate Exponential Moving Average
 */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let emaCurrent = values[0];

  result.push(emaCurrent);
  for (let i = 1; i < values.length; i++) {
    emaCurrent = values[i] * k + emaCurrent * (1 - k);
    result.push(emaCurrent);
  }
  return result;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Returns array of {timestamp, macd, signal, histogram}
 */
export function calculateMACD(
  closePrices: number[],
  timestamps: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): Indicator[] {
  if (closePrices.length < slowPeriod) return [];

  const ema12 = ema(closePrices, fastPeriod);
  const ema26 = ema(closePrices, slowPeriod);

  const macdLine = ema12.map((val12, i) => val12 - ema26[i]);
  const signalLine = ema(macdLine, signalPeriod);

  return macdLine.map((macd, i) => ({
    timestamp: timestamps[i],
    value: parseFloat(macd.toFixed(4)),
    signal: signalLine[i] ? parseFloat(signalLine[i].toFixed(4)) : undefined,
    histogram: signalLine[i] ? parseFloat((macd - signalLine[i]).toFixed(4)) : undefined,
  }));
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(
  closePrices: number[],
  timestamps: number[],
  period = 14
): Indicator[] {
  if (closePrices.length < period + 1) return [];

  const deltas: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    deltas.push(closePrices[i] - closePrices[i - 1]);
  }

  const gains: number[] = deltas.map((d) => (d > 0 ? d : 0));
  const losses: number[] = deltas.map((d) => (d < 0 ? -d : 0));

  const avgGains = ema(gains, period);
  const avgLosses = ema(losses, period);

  return avgGains.map((gain, i) => {
    const loss = avgLosses[i];
    const rs = loss === 0 ? 100 : (gain / loss) * 100;
    const rsi = 100 - 100 / (1 + rs);
    return {
      timestamp: timestamps[i + 1],
      value: parseFloat(rsi.toFixed(2)),
    };
  });
}
