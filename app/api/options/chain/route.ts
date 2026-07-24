/**
 * GSPS — /api/options/chain?symbol=TSM[&price=417.94]
 * Returns near-the-money option contracts for an underlying, grouped by
 * expiration, so the order ticket can offer a Call/Put + strike + expiry picker.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, listOptionContracts, type OptionContract } from "@/lib/brokers/alpaca";
import { fetchLatestPrice, isCryptoSymbol } from "@/lib/data/alpaca";

interface StrikeRow {
  strike: number;
  call?: string; // OCC symbol
  put?: string;
}
interface ExpiryGroup {
  expiration: string;
  strikes: StrikeRow[];
}

const MAX_EXPIRATIONS = 8;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }
  if (isCryptoSymbol(symbol)) {
    return NextResponse.json({ error: "Options are only available on US equities." }, { status: 400 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Options trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    let price = Number(searchParams.get("price"));
    if (!price || Number.isNaN(price)) {
      price = await fetchLatestPrice(symbol, "us_equity").catch(() => 0);
    }

    const contracts = await listOptionContracts(creds, {
      underlying: symbol,
      price: price || undefined,
      pct: price ? 0.2 : undefined,
    });

    const expirations = groupByExpiration(contracts).slice(0, MAX_EXPIRATIONS);

    return NextResponse.json({
      underlying: symbol.toUpperCase(),
      price: price || null,
      expirations,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

function groupByExpiration(contracts: OptionContract[]): ExpiryGroup[] {
  const byDate = new Map<string, Map<number, StrikeRow>>();
  for (const c of contracts) {
    const strike = Number(c.strike_price);
    if (!byDate.has(c.expiration_date)) byDate.set(c.expiration_date, new Map());
    const strikes = byDate.get(c.expiration_date)!;
    const row = strikes.get(strike) ?? { strike };
    if (c.type === "call") row.call = c.symbol;
    else row.put = c.symbol;
    strikes.set(strike, row);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([expiration, strikeMap]) => ({
      expiration,
      strikes: [...strikeMap.values()].sort((a, b) => a.strike - b.strike),
    }));
}
