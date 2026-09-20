/**
 * Client-side technical indicators for the candle chart.
 * All functions take the raw candle series (time-ascending) and return
 * arrays aligned to the input by `time`, skipping the warm-up window where an
 * indicator is not yet defined.
 */

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

/** Simple moving average of close over `period` bars. */
export function sma(candles: Candle[], period: number): LinePoint[] {
  if (period <= 0 || candles.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/** Exponential moving average of close over `period` bars. */
export function ema(candles: Candle[], period: number): LinePoint[] {
  if (period <= 0 || candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  // Seed with the SMA of the first `period` closes.
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export interface BollingerBands {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

/** Bollinger Bands: SMA(period) ± mult · rolling standard deviation. */
export function bollinger(candles: Candle[], period = 20, mult = 2): BollingerBands {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  if (candles.length < period) return { upper, middle, lower };
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].close - mean;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);
    const t = candles[i].time;
    middle.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + mult * sd });
    lower.push({ time: t, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

/** Wilder's RSI over `period` bars, returned on a 0–100 scale. */
export function rsi(candles: Candle[], period = 14): LinePoint[] {
  if (candles.length <= period) return [];
  const out: LinePoint[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  const rsiFrom = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out.push({ time: candles[period].time, value: rsiFrom(avgGain, avgLoss) });
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: rsiFrom(avgGain, avgLoss) });
  }
  return out;
}

export interface Macd {
  /** The MACD line: fast EMA − slow EMA. */
  macd: LinePoint[];
  /** EMA of the MACD line. */
  signal: LinePoint[];
  /** macd − signal, coloured by sign for the histogram. */
  histogram: { time: number; value: number; color: string }[];
}

const MACD_UP = "rgba(5,150,105,0.55)";
const MACD_DOWN = "rgba(220,38,38,0.55)";

/**
 * MACD (12, 26, 9). Both EMAs are seeded from an SMA of their first `period`
 * closes — the same warm-up `ema()` above uses — so the series starts where the
 * slow EMA becomes defined rather than from an arbitrary first close.
 */
export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const empty: Macd = { macd: [], signal: [], histogram: [] };
  if (candles.length < slow + signalPeriod) return empty;

  const fastEma = ema(candles, fast);
  const slowEma = ema(candles, slow);
  if (fastEma.length === 0 || slowEma.length === 0) return empty;

  // Align the two EMAs on time — the fast one starts earlier.
  const fastByTime = new Map(fastEma.map((p) => [p.time, p.value]));
  const macdLine: LinePoint[] = [];
  for (const slowPoint of slowEma) {
    const fastValue = fastByTime.get(slowPoint.time);
    if (fastValue == null) continue;
    macdLine.push({ time: slowPoint.time, value: fastValue - slowPoint.value });
  }

  // The signal line is an EMA of the MACD line, so reuse `ema()` by presenting
  // the MACD values as closes.
  const asCandles: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
  }));
  const signalLine = ema(asCandles, signalPeriod);

  const macdByTime = new Map(macdLine.map((p) => [p.time, p.value]));
  const histogram = signalLine.map((s) => {
    const value = (macdByTime.get(s.time) ?? 0) - s.value;
    return { time: s.time, value, color: value >= 0 ? MACD_UP : MACD_DOWN };
  });

  return { macd: macdLine, signal: signalLine, histogram };
}

export interface PsarPoint {
  time: number;
  value: number;
  trend: "up" | "down";
}

/**
 * Wilder's Parabolic SAR (stop-and-reverse). A chart overlay only, like every
 * other function in this file — see AGENTS.md's "Gann-grounded platform"
 * section, "Charting indicators" under Audit outcomes: this family is a
 * user-driven tool a trader can switch on to test their own idea, never
 * substance GSPS asserts. It must never feed a scored criterion, a signal
 * gate, a trade plan, or any verdict this platform issues — if that changes,
 * this comment is wrong and the boundary has been crossed.
 */
export function psar(candles: Candle[], step = 0.02, max = 0.2): PsarPoint[] {
  if (candles.length < 2) return [];
  const out: PsarPoint[] = [];

  let trend: "up" | "down" = candles[1].close >= candles[0].close ? "up" : "down";
  let af = step;
  let ep = trend === "up" ? candles[0].high : candles[0].low;
  let sar = trend === "up" ? candles[0].low : candles[0].high;

  for (let i = 1; i < candles.length; i++) {
    const prevLow1 = candles[i - 1].low;
    const prevHigh1 = candles[i - 1].high;
    const prevLow2 = i >= 2 ? candles[i - 2].low : prevLow1;
    const prevHigh2 = i >= 2 ? candles[i - 2].high : prevHigh1;

    let next = sar + af * (ep - sar);

    if (trend === "up") {
      next = Math.min(next, prevLow1, prevLow2);
      if (candles[i].low < next) {
        trend = "down";
        next = ep;
        ep = candles[i].low;
        af = step;
      } else if (candles[i].high > ep) {
        ep = candles[i].high;
        af = Math.min(af + step, max);
      }
    } else {
      next = Math.max(next, prevHigh1, prevHigh2);
      if (candles[i].high > next) {
        trend = "up";
        next = ep;
        ep = candles[i].high;
        af = step;
      } else if (candles[i].low < ep) {
        ep = candles[i].low;
        af = Math.min(af + step, max);
      }
    }

    sar = next;
    out.push({ time: candles[i].time, value: sar, trend });
  }

  return out;
}

/** Wilder-smoothed Average True Range, scoped to this file's own overlays. */
function trueRangeAtr(candles: Candle[], period: number): number[] {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period) return out;
  let avg = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = avg;
  for (let i = period; i < candles.length; i++) {
    avg = (avg * (period - 1) + tr[i]) / period;
    out[i] = avg;
  }
  return out;
}

export interface SupertrendPoint {
  time: number;
  value: number;
  trend: "up" | "down";
}

/**
 * Supertrend (ATR bands with a stop-and-reverse flip rule). Same boundary as
 * `psar()` above: a display-only overlay, never wired into scoring, gates, or
 * the trade plan.
 */
export function supertrend(candles: Candle[], period = 10, multiplier = 3): SupertrendPoint[] {
  if (candles.length <= period) return [];
  const atr = trueRangeAtr(candles, period);
  const out: SupertrendPoint[] = [];

  let finalUpper = 0;
  let finalLower = 0;
  let trend: "up" | "down" = "up";

  for (let i = period - 1; i < candles.length; i++) {
    if (Number.isNaN(atr[i])) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const basicUpper = mid + multiplier * atr[i];
    const basicLower = mid - multiplier * atr[i];

    if (out.length === 0) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      trend = candles[i].close <= finalUpper ? "down" : "up";
    } else {
      const prevClose = candles[i - 1].close;
      finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

      if (trend === "down" && candles[i].close > finalUpper) trend = "up";
      else if (trend === "up" && candles[i].close < finalLower) trend = "down";
    }

    out.push({ time: candles[i].time, value: trend === "up" ? finalLower : finalUpper, trend });
  }

  return out;
}

/** Volume histogram data colored by candle direction. */
export function volumeBars(candles: Candle[]): { time: number; value: number; color: string }[] {
  return candles
    .filter((c) => typeof c.volume === "number")
    .map((c) => ({
      time: c.time,
      value: c.volume as number,
      color: c.close >= c.open ? "rgba(5,150,105,0.5)" : "rgba(220,38,38,0.5)",
    }));
}
