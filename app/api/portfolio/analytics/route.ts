/**
 * GSPS — /api/portfolio/analytics
 * GET: portfolio performance analytics computed from the user's closed
 * trades in `trade_logs` — win/loss ratio, profit factor, Sharpe ratio, max
 * drawdown, monthly/quarterly P&L, and performance by pattern (signal_called).
 *
 * All calculation lives in lib/portfolio/analytics.ts, kept pure and
 * Supabase-free so it's unit-testable; this route is the thin fetch-and-call
 * wrapper.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePortfolioAnalytics, type ClosedTrade } from "@/lib/portfolio/analytics";

// Two years of history is enough for meaningful Sharpe/drawdown/P&L rollups
// without an unbounded row scan as an account's trade log grows.
const LOOKBACK_DAYS = 730;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("trade_logs")
      .select(
        "symbol, direction, quantity, entry_timestamp, entry_price, exit_timestamp, exit_price, outcome, profit_loss_dollars, profit_loss_percent, signal_called",
      )
      .eq("user_id", user.id)
      .not("exit_timestamp", "is", null)
      .gte("exit_timestamp", since)
      .order("exit_timestamp", { ascending: true })
      .limit(5000);

    if (error) throw error;

    const analytics = computePortfolioAnalytics((data ?? []) as ClosedTrade[]);

    return NextResponse.json({ analytics });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
