/**
 * GSPS — /api/company?symbol=AAPL
 * Fundamentals/flow snapshot — analyst coverage, price target, short interest,
 * institutional ownership, capital flow, margin terms.
 *
 * Analyst rating and price target come from Finnhub when `FINNHUB_API_KEY` is
 * set (lib/data/finnhub.ts); short interest, institutional ownership, capital
 * flow and margin terms have no vendor wired up yet, so those stay on the
 * seeded simulated generator (lib/data/company.ts) regardless. Either Finnhub
 * call failing (missing key, rate limit, network error) falls back to the
 * simulated value for that section alone — `snapshot.sources` tells the UI
 * which sections in a given response are real.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { simulateCompanySnapshot } from "@/lib/data/company";
import { fetchFinnhubAnalystRating, fetchFinnhubPriceTarget } from "@/lib/data/finnhub";

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

    const [realRating, realTarget] = await Promise.all([
      fetchFinnhubAnalystRating(symbol),
      fetchFinnhubPriceTarget(symbol, price),
    ]);
    if (realRating) {
      snapshot.analystRating = realRating;
      snapshot.sources.analystRating = "finnhub";
    }
    if (realTarget) {
      snapshot.priceTarget = realTarget;
      snapshot.sources.priceTarget = "finnhub";
    }
    snapshot.simulated = !realRating && !realTarget;

    return NextResponse.json({
      ...snapshot,
      source: snapshot.simulated ? `${provider.name}+simulated` : `${provider.name}+finnhub+simulated`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
