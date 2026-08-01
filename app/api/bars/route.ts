import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, isTimeframe } from "@/lib/timeframe";

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
