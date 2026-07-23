/**
 * GSPS — /api/options?symbol=AAPL
 * Options chain via the market-data seam. Providers with a real chain feed serve
 * it directly; otherwise we anchor a simulated near-the-money chain on the real
 * latest price (flagged `simulated: true` so the UI can label it).
 */

import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { simulateOptionChain } from "@/lib/data/synthetic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  try {
    if (provider.fetchOptionChain) {
      const chain = await provider.fetchOptionChain(symbol, assetClass);
      return NextResponse.json({ ...chain, source: provider.name });
    }
    // Live provider has no chain feed — derive one from the real price.
    const price = await provider.fetchLatestPrice(symbol, assetClass);
    const chain = simulateOptionChain(symbol, price);
    return NextResponse.json({ ...chain, source: `${provider.name}+simulated` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
