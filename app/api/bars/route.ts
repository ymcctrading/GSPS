import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, isTimeframe } from "@/lib/timeframe";

// See app/api/scan/route.ts's comment on this same constant — without it,
// this route (the chart's own data source, polled on every timeframe
// switch) falls back to Vercel's 10s Hobby default instead of the 60s
// ceiling every other market-data route already opts into. A single-symbol
// fetch is normally fast, but the shared per-provider rate limiter
// (lib/data/http.ts) can queue this request behind whatever a concurrent
// market-scan or another chart tab is already doing, and 3 retries with
// backoff on a 429/5xx alone can exceed 10s.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const timeframe = searchParams.get("timeframe") ?? "1Day";

  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }
  if (!isTimeframe(timeframe)) {
    return NextResponse.json({ error: `Invalid timeframe '${timeframe}'` }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(Date.now() - TF_LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);
  // Crypto has no feed delay; free IEX stock data can't query the most recent
  // ~15 min. Synthetic data has no delay either.
  const end =
    assetClass === "crypto" || !provider.isLive
      ? null
      : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const bars = await provider.fetchBars(
      symbol,
      timeframe,
      start,
      end,
      assetClass,
      TF_MAX_BARS[timeframe],
    );
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      assetClass,
      bars,
      source: provider.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
