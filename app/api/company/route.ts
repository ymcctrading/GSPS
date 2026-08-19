/**
 * GSPS — /api/company?symbol=AAPL
 * Fundamentals/flow snapshot — analyst coverage, price target, short interest,
 * institutional ownership, capital flow, margin terms. No vendor for this is
 * wired up yet (see lib/data/company.ts), so it's always anchored on the real
 * latest price and flagged `simulated: true`, the same seam the Options and
 * Level II routes use for their unwired data.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { simulateCompanySnapshot } from "@/lib/data/company";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  try {
    const price = await provider.fetchLatestPrice(symbol, assetClass);
    const snapshot = simulateCompanySnapshot(symbol, price);
    return NextResponse.json({ ...snapshot, source: `${provider.name}+simulated` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
