/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * from the paper account (live/SnapTrade accounts merge in when connected).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, getAccount, getPositions } from "@/lib/brokers/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";
import { parseOccSymbol } from "@/lib/portfolio/occ";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper account is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    const [account, positions] = await Promise.all([getAccount(creds), getPositions(creds)]);

    const equity = Number(account.equity);
    const lastEquity = Number(account.last_equity);
    const dayPlPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;

    const rawPositions: RawPosition[] = positions.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side,
      avgEntry: Number(p.avg_entry_price),
      currentPrice: Number(p.current_price),
      marketValue: Number(p.market_value),
      unrealizedPl: Number(p.unrealized_pl),
      unrealizedPlPct: Number(p.unrealized_plpc) * 100,
      todayPlPct: Number(p.unrealized_intraday_plpc) * 100,
      assetClassHint: p.asset_class,
    }));

    // Greeks for option legs need the underlying's spot price. An equity leg
    // already carries it; option-only underlyings need a quote fetched
    // separately — bounded to just those symbols, not a market-wide call.
    const equitySymbols = new Set(
      rawPositions.filter((p) => !parseOccSymbol(p.symbol)).map((p) => p.symbol.toUpperCase()),
    );
    const optionOnlyUnderlyings = new Set(
      rawPositions
        .map((p) => parseOccSymbol(p.symbol)?.underlying)
        .filter((u): u is string => Boolean(u) && !equitySymbols.has(u!)),
    );
    const spotEntries = await Promise.all(
      [...optionOnlyUnderlyings].map(async (sym) => {
        try {
          const provider = getMarketDataProvider();
          const price = await provider.fetchLatestPrice(sym, isCryptoSymbol(sym) ? "crypto" : "us_equity");
          return [sym, price] as const;
        } catch {
          return [sym, null] as const;
        }
      }),
    );
    const spotMap = new Map<string, number | null>(spotEntries);
    const equityPriceMap = new Map(
      rawPositions.filter((p) => equitySymbols.has(p.symbol.toUpperCase())).map((p) => [p.symbol.toUpperCase(), p.currentPrice]),
    );

    const blendedPositions = buildBlendedPositions(
      rawPositions,
      (underlying) => equityPriceMap.get(underlying) ?? spotMap.get(underlying) ?? null,
    );

    return NextResponse.json({
      mode: "paper",
      account: {
        equity,
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
        dayPlPct,
        currency: account.currency,
      },
      // Flat list, kept for callers that only need the equity-shaped view
      // (e.g. the chart trade widget's live P/L drawer).
      positions: rawPositions,
      // Grouped by underlying — shares leg + each option leg, with greeks
      // modeled from the position's own premium. See lib/portfolio/blend.ts.
      blendedPositions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
