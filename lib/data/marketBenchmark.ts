/**
 * The market's daily bars (SPY), read once per ET day per server instance, for
 * Gann's early and late leaders (`lib/gann/leadership.ts`). A failed read
 * returns null and the leadership reading falls back to the first-year high
 * only; nothing waits on it twice in a day.
 */

import type { Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { etDateKey } from "@/lib/market/session";

export const MARKET_SYMBOL = "SPY";

let cached: { day: string; bars: Promise<Bar[] | null> } | null = null;

export function getMarketDailyBars(now: Date = new Date()): Promise<Bar[] | null> {
  const day = etDateKey(now);
  if (cached && cached.day === day) return cached.bars;
  const start = new Date(now.getTime() - 400 * 86_400_000);
  const bars = getMarketDataProvider()
    .fetchBars(MARKET_SYMBOL, "1Day", start, null, "us_equity")
    .then((b) => b.filter((x) => x.t.slice(0, 10) < day))
    .catch(() => null);
  cached = { day, bars };
  return bars;
}

export function resetMarketDailyBarsCache(): void {
  cached = null;
}
