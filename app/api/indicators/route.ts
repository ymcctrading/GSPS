/**
 * GSPS — /api/indicators
 * Calculates technical indicators (MACD, RSI) for a given symbol and timeframe
 */

import { NextRequest, NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { calculateMACD, calculateRSI } from "@/lib/analysis/indicators";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import type { Timeframe } from "@/lib/types";

// Lookback window per timeframe, in days.
const RANGES: Record<Timeframe, number> = {
  "1Month": 3650,
  "1Week": 1825,
  "1Day": 365,
  "1Hour": 30,
  "15Min": 7,
  "5Min": 5,
  "1Min": 2,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const timeframe = (searchParams.get("timeframe") ?? "5Min") as Timeframe;

  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }
  if (!(timeframe in RANGES)) {
    return NextResponse.json({ error: `Invalid timeframe '${timeframe}'` }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(Date.now() - RANGES[timeframe] * 24 * 3600 * 1000);
  // Crypto has no feed delay; free IEX stock data can't query the most recent
  // ~15 min. Synthetic data has no delay either.
  const end =
    assetClass === "crypto" || !provider.isLive
      ? null
      : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const bars = await provider.fetchBars(symbol, timeframe, start, end, assetClass);
    if (!bars || bars.length === 0) {
      return NextResponse.json({ error: "No bar data available" }, { status: 404 });
    }

    const closePrices = bars.map((b) => b.c);
    const timestamps = bars.map((b) => new Date(b.t).getTime() / 1000);

    const macd = calculateMACD(closePrices, timestamps);
    const rsi = calculateRSI(closePrices, timestamps);

    // Return only the most recent values for display
    const latestMACD = macd[macd.length - 1] || null;
    const latestRSI = rsi[rsi.length - 1] || null;

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      macd: {
        current: latestMACD?.value ?? null,
        signal: latestMACD?.signal ?? null,
        histogram: latestMACD?.histogram ?? null,
      },
      rsi: {
        current: latestRSI?.value ?? null,
      },
      history: {
        macd: macd.slice(-50), // Last 50 values for charting
        rsi: rsi.slice(-50),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
