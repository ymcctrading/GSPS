import { NextRequest, NextResponse } from "next/server";
import { fetchBars, isCryptoSymbol } from "@/lib/data/alpaca";
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
  const timeframe = (searchParams.get("timeframe") ?? "1Day") as Timeframe;

  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }
  if (!(timeframe in RANGES)) {
    return NextResponse.json({ error: `Invalid timeframe '${timeframe}'` }, { status: 400 });
  }

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(Date.now() - RANGES[timeframe] * 24 * 3600 * 1000);
  // Crypto has no feed delay; free IEX stock data can't query the most recent ~15 min.
  const end = assetClass === "crypto" ? null : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const bars = await fetchBars(symbol, timeframe, start, end, assetClass);
    return NextResponse.json({ symbol: symbol.toUpperCase(), timeframe, assetClass, bars });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
