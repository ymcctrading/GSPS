/**
 * GSPS — /api/strategy-plugins/[id]/backtest
 *
 * Phase 4's evidence-gathering hook (`docs/STRATEGY_MODES.md`'s "Custom-
 * script / plugin system" section): walks one saved script forward over a
 * symbol/timeframe's available history via
 * `lib/backtest/replayCustomScript.ts`, so a script's author can see how
 * often, in which direction, and at what prices it would have armed before
 * ever trusting it live. See that module's own header for why this is
 * evidence-gathering only — armed events, not a win-rate/R-multiple/P&L
 * claim, which would need a fill-simulation methodology this project has
 * not built or validated for arbitrary user-authored entry/stop/target
 * logic.
 *
 * Same private-to-author scoping as `../evaluate/route.ts`: the plugin
 * lookup is scoped to `user_id = auth user`, so this route structurally
 * cannot backtest another account's script.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, parseTimeframe } from "@/lib/timeframe";
import { replayCustomScript } from "@/lib/backtest/replayCustomScript";

// A full-history backtest fetch takes longer than a single-bar evaluate
// call; same 60s Vercel Hobby ceiling every other bar-fetching route in
// this codebase budgets for.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { data: plugin, error } = await supabase
    .from("strategy_plugins")
    .select("id, name, author, source, version")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!plugin) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const timeframe = parseTimeframe(searchParams.get("timeframe"), "5Min");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(Date.now() - TF_LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);
  const end =
    assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const bars = await provider.fetchBars(
      symbol,
      timeframe,
      start,
      end,
      assetClass,
      TF_MAX_BARS[timeframe],
    );
    if (!bars || bars.length === 0) {
      return NextResponse.json({ error: "No bar data available" }, { status: 404 });
    }

    const result = replayCustomScript(
      symbol.toUpperCase(),
      { scriptId: plugin.id, scriptName: plugin.name, author: plugin.author, version: plugin.version },
      plugin.source,
      bars,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: "Script no longer compiles", details: result.errors },
        { status: 409 },
      );
    }

    return NextResponse.json({ timeframe, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
