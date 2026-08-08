/**
 * Per-candle readout — the numbers behind the panel that reports whichever bar
 * the crosshair is sitting on.
 * -----------------------------------------------------------------------------
 * Kept separate from the chart component because it is the part worth testing:
 * a body percentage that divides by a zero range, or a change percentage taken
 * against the wrong bar, is a wrong number shown with full confidence.
 *
 * Everything here is derived from the bar itself plus its neighbours — no chart
 * library types, no DOM.
 */

export interface ReadoutBar {
  /** Epoch seconds, as the chart series stores it. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** True where the bar printed outside the regular session. */
  extended?: boolean;
}

export interface CandleReadout {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  extended: boolean;
  /** high − low. Zero on a bar that never moved. */
  range: number;
  /** |close − open| as a share of range, 0–1. Zero range reads as a doji (0). */
  bodyShare: number;
  /** close − open, signed. */
  change: number;
  /** close − open as a percentage of open. */
  changePct: number;
  /** Where close landed inside the bar's range, 0 = at the low, 1 = at the high. */
  closePosition: number;
  /**
   * Volume against the trailing average (1 = average, 2 = twice normal). Null
   * until there is enough history behind the bar to average.
   */
  relVolume: number | null;
  direction: "up" | "down" | "flat";
}

/** Bars of history required behind a bar before its relative volume is reported. */
export const REL_VOLUME_LOOKBACK = 20;

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Build the readout for `bars[index]`. Returns null for an index outside the
 * series so callers can pass a crosshair position through without guarding.
 */
export function buildReadout(bars: ReadoutBar[], index: number): CandleReadout | null {
  const bar = bars[index];
  if (!bar) return null;

  const range = bar.high - bar.low;
  const change = bar.close - bar.open;

  // Average the bars *behind* this one — including the bar itself would pull the
  // baseline toward the very spike the ratio is meant to reveal.
  const from = Math.max(0, index - REL_VOLUME_LOOKBACK);
  const window = bars.slice(from, index);
  const avgVolume = window.length > 0
    ? window.reduce((sum, b) => sum + b.volume, 0) / window.length
    : 0;

  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    extended: bar.extended ?? false,
    range,
    bodyShare: safeDiv(Math.abs(change), range),
    change,
    changePct: safeDiv(change, bar.open) * 100,
    closePosition: range === 0 ? 0.5 : (bar.close - bar.low) / range,
    relVolume: avgVolume > 0 ? bar.volume / avgVolume : null,
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}

/** Index of the bar at `time`, or -1. Bars are time-ordered and unique. */
export function indexAtTime(bars: ReadoutBar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = bars[mid].time;
    if (t === time) return mid;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Price precision that keeps a sub-penny instrument readable without printing
 * four decimals on a $400 stock.
 */
export function priceDigits(price: number): number {
  if (price >= 100) return 2;
  if (price >= 1) return 3;
  return 5;
}

export function formatPrice(price: number, digits = priceDigits(price)): string {
  return price.toFixed(digits);
}

/** 215_800_000 → "215.8M". Volume is scanned, not read digit by digit. */
export function formatVolume(volume: number): string {
  const abs = Math.abs(volume);
  if (abs >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
  return volume.toLocaleString("en-US", { maximumFractionDigits: abs < 10 ? 2 : 0 });
}
