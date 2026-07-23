/**
 * GET /api/candles?ticker=NOK&interval=1d&includeExtendedHours=false
 * Returns session-correct OHLCV bars (the 8-vs-9-candle fix in action).
 *
 * Lookback windows honor the spec: 1m retains up to 5 days; 1M supports a long
 * macro window. Defaults are conservative for Phase 0's mock provider.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/marketData";
import type { Interval } from "@/lib/marketData/types";

const DAY = 24 * 60 * 60 * 1000;

/** Default lookback per interval (ms), matching the app's timeframe ladder. */
const LOOKBACK_MS: Record<Interval, number> = {
  "1m": 15 * DAY,
  "5m": 15 * DAY,
  "15m": 30 * DAY,
  "30m": 30 * DAY,
  "1h": 180 * DAY,
  "2h": 180 * DAY,
  "4h": 180 * DAY,
  "1d": 5 * 365 * DAY,
  "1w": 15 * 365 * DAY,
  "1M": 25 * 365 * DAY, // "MAX"
};

const VALID: Interval[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
  "1w",
  "1M",
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const interval = (searchParams.get("interval") ?? "1d") as Interval;
  const includeExtendedHours = searchParams.get("includeExtendedHours") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Missing 'ticker'" }, { status: 400 });
  }
  if (!VALID.includes(interval)) {
    return NextResponse.json(
      { error: `Invalid 'interval'. One of: ${VALID.join(", ")}` },
      { status: 400 }
    );
  }

  const to = Date.now();
  const from = to - LOOKBACK_MS[interval];
  const bars = await getMarketDataProvider().getCandles({
    symbol: ticker,
    interval,
    from,
    to,
    includeExtendedHours,
  });

  return NextResponse.json({
    ticker: ticker.toUpperCase(),
    interval,
    includeExtendedHours,
    count: bars.length,
    bars,
  });
}
