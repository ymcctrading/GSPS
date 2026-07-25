/**
 * Timeframe registry — the single source of truth for what one candle on a
 * given chart timeframe represents.
 * -----------------------------------------------------------------------------
 * Every consumer (the chart toolbar, `/api/bars`, the synthetic generator, the
 * Alpaca adapter) reads its interval, label and lookback window from here, so a
 * "5Min" candle always covers exactly five minutes no matter who produced it.
 *
 * Bucket boundaries are UTC. Fixed-length timeframes floor on the epoch; week,
 * month and year floor to the calendar boundary (Monday, the 1st, Jan 1) so a
 * candle covers exactly the period its label claims rather than a rolling
 * approximation of it.
 */

import type { Timeframe } from "@/lib/types";

/** Selector order, longest candle first (matches the chart toolbar). */
export const TIMEFRAMES: Timeframe[] = [
  "1Year",
  "1Month",
  "1Week",
  "1Day",
  "4Hour",
  "2Hour",
  "1Hour",
  "15Min",
  "5Min",
  "1Min",
];

/**
 * Duration a single candle covers, in ms. Week/month/year are averages — use
 * `startOfCandle`/`shiftCandles` when exact boundaries matter, and this only for
 * sizing (how many candles fit in a span).
 */
export const TF_INTERVAL_MS: Record<Timeframe, number> = {
  "1Year": 365.25 * 24 * 3600 * 1000,
  "1Month": 30.44 * 24 * 3600 * 1000,
  "1Week": 7 * 24 * 3600 * 1000,
  "1Day": 24 * 3600 * 1000,
  "4Hour": 4 * 3600 * 1000,
  "2Hour": 2 * 3600 * 1000,
  "1Hour": 3600 * 1000,
  "15Min": 15 * 60 * 1000,
  "5Min": 5 * 60 * 1000,
  "1Min": 60 * 1000,
};

/**
 * Toolbar label. Minutes stay lowercase and months/years uppercase so `1m`
 * never has to be read twice to tell it apart from `1M`.
 */
export const TF_LABEL: Record<Timeframe, string> = {
  "1Year": "Y",
  "1Month": "M",
  "1Week": "W",
  "1Day": "D",
  "4Hour": "4H",
  "2Hour": "2H",
  "1Hour": "1H",
  "15Min": "15m",
  "5Min": "5m",
  "1Min": "1m",
};

/** What one candle represents, spelled out for tooltips and the chart caption. */
export const TF_CANDLE_LABEL: Record<Timeframe, string> = {
  "1Year": "1 year",
  "1Month": "1 month",
  "1Week": "1 week",
  "1Day": "1 day",
  "4Hour": "4 hours",
  "2Hour": "2 hours",
  "1Hour": "1 hour",
  "15Min": "15 minutes",
  "5Min": "5 minutes",
  "1Min": "1 minute",
};

/**
 * How far back a chart loads, in days, per timeframe. History is scaled to what
 * the timeframe is actually used for:
 *
 * - 1m/5m are read in real time, so a couple of weeks is all that's useful.
 * - 15m bridges the two — enough to see the last few weeks of structure.
 * - 1h–1D are where past support/resistance gets compared, so they carry 2–3
 *   years.
 * - 1W/1M/1Y ask for everything the provider has (Alpaca tops out around six
 *   years on the free feed; the request is simply capped by what exists).
 *
 * This is the *chart's* window. The scan pipeline's windows are fixed by the
 * strategy (10yr monthly / 5yr weekly / 1yr daily) and live in
 * `fetchAllTimeframes` — don't collapse the two.
 */
export const TF_LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1Year": 18250, // ~50y — take whatever exists
  "1Month": 10950, // ~30y
  "1Week": 7300, // ~20y
  "1Day": 1095, // 3y
  "4Hour": 1095, // 3y
  "2Hour": 730, // 2y
  "1Hour": 730, // 2y
  "15Min": 60,
  "5Min": 15,
  "1Min": 15,
};

/**
 * Bar budget per timeframe — the outer bound on how many candles a chart pulls,
 * so a wide window can't turn into an unbounded payload. Providers fill this
 * from the most recent candle backwards, so hitting the budget trims the oldest
 * history rather than leaving the chart short of "now".
 */
export const TF_MAX_BARS: Record<Timeframe, number> = {
  "1Year": 100,
  "1Month": 600,
  "1Week": 1200,
  "1Day": 1200,
  "4Hour": 3600,
  "2Hour": 4500,
  "1Hour": 8000,
  "15Min": 3200,
  "5Min": 3000,
  "1Min": 12000,
};

/**
 * How many candles the chart frames on load. The rest of the window stays
 * loaded and one pan away — a 2yr hourly chart is there to compare old levels
 * against, but fitting all ~8k candles on screen at once would render them as
 * hairlines.
 */
export const DEFAULT_VISIBLE_BARS = 180;

/** Candles that close inside a single trading day — these roll live. */
export const INTRADAY_TFS: Timeframe[] = ["4Hour", "2Hour", "1Hour", "15Min", "5Min", "1Min"];

/**
 * Timeframes where extended-hours shading is meaningful. A 2H/4H candle spans
 * the session boundary, so classifying the whole bar as pre/post would be a lie.
 */
export const EXTENDED_HOURS_TFS: Timeframe[] = ["1Hour", "15Min", "5Min", "1Min"];

export function isTimeframe(value: string): value is Timeframe {
  return Object.prototype.hasOwnProperty.call(TF_INTERVAL_MS, value);
}

/**
 * Shorthand spellings accepted from query strings (`?timeframe=5m`). Matched
 * case-insensitively, and only after an exact canonical match fails — so
 * "1Month" stays a month while "1m" is a minute.
 */
const TF_ALIASES: Record<string, Timeframe> = {
  "1min": "1Min", "1m": "1Min",
  "5min": "5Min", "5m": "5Min",
  "15min": "15Min", "15m": "15Min",
  "1hour": "1Hour", "1h": "1Hour", "60m": "1Hour", "60min": "1Hour",
  "2hour": "2Hour", "2h": "2Hour",
  "4hour": "4Hour", "4h": "4Hour",
  "1day": "1Day", "1d": "1Day", d: "1Day", daily: "1Day",
  "1week": "1Week", "1w": "1Week", w: "1Week", weekly: "1Week",
  "1month": "1Month", "1mo": "1Month", mo: "1Month", monthly: "1Month",
  "1year": "1Year", "1y": "1Year", y: "1Year", yearly: "1Year",
};

/** Resolve a user-supplied timeframe, falling back when it isn't recognised. */
export function parseTimeframe(value: string | null | undefined, fallback: Timeframe): Timeframe {
  if (!value) return fallback;
  if (isTimeframe(value)) return value;
  return TF_ALIASES[value.toLowerCase()] ?? fallback;
}

/** Start of the candle containing `ms`, in UTC. */
export function startOfCandle(ms: number, timeframe: Timeframe): number {
  const d = new Date(ms);
  switch (timeframe) {
    case "1Year":
      return Date.UTC(d.getUTCFullYear(), 0, 1);
    case "1Month":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    case "1Week": {
      const mondayOffset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
    }
    default: {
      const step = TF_INTERVAL_MS[timeframe];
      return Math.floor(ms / step) * step;
    }
  }
}

/**
 * Shift a candle-aligned timestamp by `n` whole candles (negative goes back).
 * Months and years vary in length, so they step on the calendar rather than by
 * a fixed number of milliseconds.
 */
export function shiftCandles(ms: number, timeframe: Timeframe, n: number): number {
  const d = new Date(ms);
  switch (timeframe) {
    case "1Year":
      return Date.UTC(d.getUTCFullYear() + n, 0, 1);
    case "1Month":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
    default:
      return ms + n * TF_INTERVAL_MS[timeframe];
  }
}

/**
 * `count` consecutive candle-open timestamps, ascending, ending with the candle
 * that contains `endMs`. Consecutive entries are exactly one candle apart, so a
 * series built on these has no half-width or overlapping bars.
 */
export function candleOpens(endMs: number, timeframe: Timeframe, count: number): number[] {
  const last = startOfCandle(endMs, timeframe);
  const opens: number[] = [];
  for (let i = count - 1; i >= 0; i--) opens.push(shiftCandles(last, timeframe, -i));
  return opens;
}
