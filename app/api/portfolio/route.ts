/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * from the paper account (live/SnapTrade accounts merge in when connected).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  envCreds,
  getAccount,
  getPositions,
  listFillActivities,
  type AlpacaCreds,
} from "@/lib/brokers/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { deriveOpenedAtBySymbol, type Execution, type OpenedAt } from "@/lib/portfolio/opened-at";

/**
 * How far back to walk the fill history when deriving open timestamps.
 *
 * A position held longer than this replays against an incomplete history, and
 * `deriveOpenedAt` reports that as `insufficient-history` rather than dating
 * the position from the first fill it happens to see. Widening the window
 * costs more broker pages; it never makes a wrong timestamp right.
 */
const FILL_HISTORY_DAYS = 365;

/**
 * Executions for every currently-held symbol, as `deriveOpenedAt` consumes
 * them. A broker failure yields an empty list, which surfaces as
 * "Unavailable — historical fill data missing" on each row rather than a
 * fabricated date.
 */
async function fetchExecutions(creds: AlpacaCreds): Promise<Execution[]> {
  try {
    const activities = await listFillActivities(creds, {
      since: new Date(Date.now() - FILL_HISTORY_DAYS * 24 * 3600 * 1000),
    });
    return activities.map((a) => ({
      symbol: a.symbol,
      // Alpaca reports a short sale as `sell_short`; for net-quantity purposes
      // it is a sell like any other.
      side: a.side === "buy" ? "buy" : "sell",
      filledQty: Number(a.qty),
      filledAt: a.transaction_time,
    }));
  } catch (err) {
    console.error(
      `portfolio: fill history unavailable — ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

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
    const [account, positions, executions] = await Promise.all([
      getAccount(creds),
      getPositions(creds),
      fetchExecutions(creds),
    ]);

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

    // Open timestamps are derived from the execution history, not from an
    // order's placement time: a limit order can rest for days before it fills,
    // and the position began at the fill. Replayed once for the whole
    // portfolio rather than once per leg.
    const openedBySymbol: Map<string, OpenedAt> = deriveOpenedAtBySymbol(
      executions,
      new Map(rawPositions.map((p) => [p.symbol.toUpperCase(), p.qty])),
    );

    const blendedPositions = buildBlendedPositions(
      rawPositions,
      (underlying) => equityPriceMap.get(underlying) ?? spotMap.get(underlying) ?? null,
      (symbol) => openedBySymbol.get(symbol),
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
      // Broker execution data, not market data. Kept as its own block so the
      // UI can say which source a number came from and when it was read.
      sync: {
        syncedAt: new Date().toISOString(),
        source: "alpaca-paper",
        /** False when the fill history couldn't be read, so open timestamps are unavailable. */
        fillHistoryAvailable: executions.length > 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
