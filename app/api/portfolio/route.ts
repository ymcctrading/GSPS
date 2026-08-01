/**
 * GSPS — /api/portfolio
 * Back-office snapshot: account equity, P/L percentages, and open positions
 * from the paper account (live/SnapTrade accounts merge in when connected).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, getAccount, getPositions } from "@/lib/brokers/alpaca";
import { reconcilePositions } from "@/lib/portfolio/reconcile";

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

    // Reconcile our `positions` ledger against what's actually open at the
    // broker: records newly-opened positions, and for ones that closed since
    // the last poll, derives exit_condition + realized P/L into trade_logs.
    await reconcilePositions(
      supabase,
      creds,
      user.id,
      positions.map((p) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        side: p.side,
        avgEntry: Number(p.avg_entry_price),
      })),
    );

    // Called stop-loss per symbol, now sourced from the just-reconciled
    // `positions` row rather than re-deriving it from `orders` each time.
    const { data: openPositionRows } = await supabase
      .from("positions")
      .select("symbol, stop_loss")
      .eq("user_id", user.id)
      .eq("closed", false);
    const stopLossBySymbol = new Map(
      (openPositionRows ?? [])
        .filter((r) => r.stop_loss != null)
        .map((r) => [r.symbol, Number(r.stop_loss)]),
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
