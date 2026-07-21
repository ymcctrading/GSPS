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
    const [account, positions] = await Promise.all([getAccount(creds), getPositions(creds)]);

    const equity = Number(account.equity);
    const lastEquity = Number(account.last_equity);
    const dayPlPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;

    return NextResponse.json({
      mode: "paper",
      account: {
        equity,
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
        dayPlPct,
        currency: account.currency,
      },
      positions: (positions as any[]).map((p) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        side: p.side,
        avgEntry: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        marketValue: Number(p.market_value),
        unrealizedPl: Number(p.unrealized_pl),
        unrealizedPlPct: Number(p.unrealized_plpc) * 100,
        todayPlPct: Number(p.unrealized_intraday_plpc) * 100,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
