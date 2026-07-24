/**
 * GSPS — /api/level2?symbol=AAPL
 * Level II (market depth) via the market-data seam. Providers with a real depth
 * feed serve it directly; otherwise we anchor a simulated order book on the real
 * latest price (flagged `simulated: true` so the UI can label it).
 */

import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { simulateLevel2 } from "@/lib/data/synthetic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  try {
    if (provider.fetchLevel2) {
      const book = await provider.fetchLevel2(symbol, assetClass);
      return NextResponse.json({ ...book, source: provider.name });
    }
    const price = await provider.fetchLatestPrice(symbol, assetClass);
    const book = simulateLevel2(symbol, price);
    return NextResponse.json({ ...book, source: `${provider.name}+simulated` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
