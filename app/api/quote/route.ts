/**
 * GSPS — /api/quote?symbol=BTC
 * Latest trade price, polled by the chart for live up-to-the-second updates.
 * Crypto is real-time; stocks use the near-real-time IEX last trade.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchLatestPrice, isCryptoSymbol } from "@/lib/data/alpaca";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  try {
    const price = await fetchLatestPrice(symbol, assetClass);
    return NextResponse.json({ symbol: symbol.toUpperCase(), price, assetClass, at: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
