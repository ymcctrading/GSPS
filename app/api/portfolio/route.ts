/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * from the paper account (live/SnapTrade accounts merge in when connected).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, getAccount, getPositions } from "@/lib/brokers/alpaca";

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
    const [account, rawPositions] = await Promise.all([getAccount(creds), getPositions(creds)]);
    const positions = rawPositions as any[];

    const equity = Number(account.equity);
    const lastEquity = Number(account.last_equity);
    const dayPlPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;

    // Most recently called stop-loss per symbol, so the client can raise an
    // SL-hit alert the moment live price crosses it. Only bracket orders
    // capture a stop_price at order time — symbols without one stay null.
    const symbols = positions.map((p) => p.symbol);
    const stopLossBySymbol = new Map<string, number>();
    if (symbols.length > 0) {
      const { data: orderRows } = await supabase
        .from("orders")
        .select("symbol, stop_price, created_at")
        .eq("user_id", user.id)
        .eq("mode", "paper")
        .in("symbol", symbols)
        .not("stop_price", "is", null)
        .order("created_at", { ascending: false });
      for (const row of orderRows ?? []) {
        if (!stopLossBySymbol.has(row.symbol)) stopLossBySymbol.set(row.symbol, Number(row.stop_price));
      }
    }

    return NextResponse.json({
      mode: "paper",
      account: {
        equity,
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
        dayPlPct,
        currency: account.currency,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        side: p.side,
        avgEntry: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        marketValue: Number(p.market_value),
        unrealizedPl: Number(p.unrealized_pl),
        unrealizedPlPct: Number(p.unrealized_plpc) * 100,
        todayPlPct: Number(p.unrealized_intraday_plpc) * 100,
        stopLoss: stopLossBySymbol.get(p.symbol) ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
