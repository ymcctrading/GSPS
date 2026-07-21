/**
 * Tick -> OHLCV aggregation with session-correct bucketing.
 *
 * Fixes the candle-count discrepancy (review log O-2 diagnosis): daily bars are
 * grouped by ET *trading date* using RTH ticks only (unless ETH is explicitly
 * requested), so the same multi-day window always yields the same candle count
 * regardless of DST or pre/post-market leakage.
 */
import type { Interval, OHLCVBar, Tick } from "@/lib/marketData/types";
import {
  classifySession,
  etTradingDate,
  isRegularHours,
} from "@/lib/candles/sessions";

const INTRADAY_MINUTES: Partial<Record<Interval, number>> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
};

/** Build one OHLCV bar from an ordered, non-empty list of ticks. */
function barFromTicks(bucketTs: number, ticks: Tick[]): OHLCVBar {
  const open = ticks[0].price;
  const close = ticks[ticks.length - 1].price;
  let high = -Infinity;
  let low = Infinity;
  let volume = 0;
  for (const t of ticks) {
    if (t.price > high) high = t.price;
    if (t.price < low) low = t.price;
    volume += t.size;
  }
  return { timestamp: bucketTs, open, high, low, close, volume };
}

/**
 * Aggregate ticks into daily bars keyed by ET trading date.
 * By default only RTH ticks count toward a daily candle; pre/post-market ticks
 * are routed to the ETH layer and excluded unless includeExtendedHours is true.
 */
export function aggregateDaily(
  ticks: Tick[],
  opts: { includeExtendedHours?: boolean } = {}
): OHLCVBar[] {
  const buckets = new Map<string, Tick[]>();
  for (const t of ticks) {
    const session = classifySession(t.timestamp);
    if (session === "CLOSED") continue;
    if (!opts.includeExtendedHours && session !== "RTH") continue;
    const key = etTradingDate(t.timestamp);
    const arr = buckets.get(key);
    if (arr) arr.push(t);
    else buckets.set(key, [t]);
  }

  const sortedDates = [...buckets.keys()].sort();
  return sortedDates.map((date) => {
    const dayTicks = buckets.get(date)!.sort((a, b) => a.timestamp - b.timestamp);
    // Anchor the daily bar timestamp to its first tick (stable, timezone-safe).
    const bar = barFromTicks(dayTicks[0].timestamp, dayTicks);
    bar.session = "RTH";
    return bar;
  });
}

/**
 * Aggregate ticks into fixed-width intraday bars (1m/5m/15m/1h).
 * Buckets align to the UTC epoch grid for the given width; ETH handling mirrors
 * daily aggregation.
 */
export function aggregateIntraday(
  ticks: Tick[],
  interval: Interval,
  opts: { includeExtendedHours?: boolean } = {}
): OHLCVBar[] {
  const minutes = INTRADAY_MINUTES[interval];
  if (!minutes) {
    throw new Error(`aggregateIntraday: unsupported interval "${interval}"`);
  }
  const widthMs = minutes * 60_000;
  const buckets = new Map<number, Tick[]>();

  for (const t of ticks) {
    const session = classifySession(t.timestamp);
    if (session === "CLOSED") continue;
    if (!opts.includeExtendedHours && !isRegularHours(t.timestamp)) continue;
    const bucketTs = Math.floor(t.timestamp / widthMs) * widthMs;
    const arr = buckets.get(bucketTs);
    if (arr) arr.push(t);
    else buckets.set(bucketTs, [t]);
  }

  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((ts) => {
      const bucketTicks = buckets.get(ts)!.sort((a, b) => a.timestamp - b.timestamp);
      return barFromTicks(ts, bucketTicks);
    });
}

/** Dispatch to daily or intraday aggregation based on interval. */
export function aggregate(
  ticks: Tick[],
  interval: Interval,
  opts: { includeExtendedHours?: boolean } = {}
): OHLCVBar[] {
  if (interval === "1d") return aggregateDaily(ticks, opts);
  if (interval in INTRADAY_MINUTES) return aggregateIntraday(ticks, interval, opts);
  // 1w / 1M roll up from daily; kept simple for Phase 0.
  const daily = aggregateDaily(ticks, opts);
  return rollUpCalendar(daily, interval);
}

/** Roll daily bars up to weekly/monthly buckets (ET calendar). */
function rollUpCalendar(daily: OHLCVBar[], interval: Interval): OHLCVBar[] {
  if (interval !== "1w" && interval !== "1M") return daily;
  const buckets = new Map<string, OHLCVBar[]>();
  for (const bar of daily) {
    const d = new Date(bar.timestamp);
    const key =
      interval === "1M"
        ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
        : `${d.getUTCFullYear()}-W${Math.floor(dayOfYear(d) / 7)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(bar);
    else buckets.set(key, [bar]);
  }
  return [...buckets.values()].map((group) => ({
    timestamp: group[0].timestamp,
    open: group[0].open,
    high: Math.max(...group.map((g) => g.high)),
    low: Math.min(...group.map((g) => g.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((s, g) => s + g.volume, 0),
  }));
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}
