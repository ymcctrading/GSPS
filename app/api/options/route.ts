/**
 * GSPS — /api/options?symbol=AAPL[&expiration=YYYY-MM-DD]
 * Options chain via the market-data seam. A provider with a real chain (Alpaca:
 * the listed contracts with their real quotes, `lib/options/liveChain.ts`)
 * serves it, for the asked expiration or Gann's 30-day term. Only a provider
 * with no chain at all (the keyless demo) gets a simulated chain anchored on
 * the latest price, flagged `simulated: true` so the UI labels it. A failed
 * read of the real chain is an error, never a quiet fall back to modelled
 * numbers.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { simulateOptionChain } from "@/lib/data/synthetic";
import {
  expirationHorizonEnd,
  expirationHorizonMonths,
  generateExpirations,
  toDateInput,
} from "@/lib/options/contracts";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  if (assetClass === "crypto" && provider.isLive) {
    return NextResponse.json({ error: "Options are listed on US stocks and funds only." }, { status: 400 });
  }
  const expirationParam = searchParams.get("expiration");
  const expiration = expirationParam && /^\d{4}-\d{2}-\d{2}$/.test(expirationParam) ? expirationParam : undefined;
  // Expiration ladder the picker may offer: 12 months on daily-expiry names
  // (SPY/QQQ/IWM), 24 on everything else. A real chain's own listed
  // expirations replace the generated ladder.
  const horizon = {
    months: expirationHorizonMonths(symbol),
    maxDate: toDateInput(expirationHorizonEnd(symbol)),
    expirations: generateExpirations(symbol),
  };

  try {
    if (provider.fetchOptionChain) {
      const chain = await provider.fetchOptionChain(symbol, assetClass, expiration);
      return NextResponse.json({
        ...chain,
        horizon: { ...horizon, expirations: chain.expirations ?? horizon.expirations },
        source: provider.name,
      });
    }
    // Live provider has no chain feed — derive one from the real price.
    const price = await provider.fetchLatestPrice(symbol, assetClass);
    const chain = simulateOptionChain(symbol, price);
    return NextResponse.json({ ...chain, horizon, source: `${provider.name}+simulated` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
