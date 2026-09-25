/**
 * GSPS — /api/strategy-plugins/[id]/evaluate
 *
 * Phase 3's "level-generation hook" and the data source for its chart-
 * plotting hook (`docs/STRATEGY_MODES.md`'s "Custom-script / plugin system"
 * section): computes one saved custom script's entry/stop/TP1/master-target
 * for a symbol (mirroring `/api/strategy-levels`'s built-in-mode shape) AND
 * the script's referenced indicator series for chart display
 * (`lib/strategies/custom/plot.ts`), in one call — a chart panel that wants
 * both a script's plotted lines and its computed levels needs only this one
 * fetch, matching the design sketch's "reuse the existing overlay-series
 * rendering path" instruction rather than adding a second data path.
 *
 * Never wired into scanning, scoring, `SignalGates`, or Automation. Private
 * to the authoring user: the plugin lookup is scoped to `user_id = auth
 * user`, so this route structurally cannot evaluate another user's script —
 * there is no separate tier check beyond that, since only Wall Street can
 * ever have authored a row here in the first place
 * (`/api/strategy-plugins`'s own `isCustomScriptAuthoringAllowedForPolicy`
 * gate on create). A script whose author's tier has since changed is not
 * re-checked here — same "server-resolved on every read/write" principle,
 * just resolved at the one place ownership already lives.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, parseTimeframe } from "@/lib/timeframe";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import { computeScriptPlotSeries } from "@/lib/strategies/custom/plot";

// Same reasoning as /api/strategy-levels and /api/bars: a symbol fetch can
// queue behind the shared per-provider rate limiter.
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
    .select("id, name, author, source, version, active")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!plugin) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
  if (!plugin.active) {
    return NextResponse.json({ error: "This script is inactive." }, { status: 409 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const timeframe = parseTimeframe(searchParams.get("timeframe"), "5Min");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const compiled = compileCustomScript(plugin.source, {
    scriptId: plugin.id,
    scriptName: plugin.name,
    author: plugin.author,
    version: plugin.version,
  });
  if (!compiled.ok) {
    return NextResponse.json(
      { error: "Script no longer compiles", details: compiled.errors },
      { status: 409 },
    );
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

    const levels = compiled.evaluator!(bars);

    // Zipped to each bar's own timestamp (epoch seconds, matching
    // components/chart/candles.tsx's own `new Date(b.t).getTime() / 1000`
    // convention) rather than returned as bare index-aligned arrays — the
    // chart's own candle fetch is a separate request, so time is the only
    // join key that's safe regardless of exactly which bars each fetch
    // happened to return.
    const series = computeScriptPlotSeries(compiled.ast!, bars).map((s) => ({
      label: s.label,
      points: s.points
        .map((value, i) => (value == null ? null : { time: Math.floor(new Date(bars[i].t).getTime() / 1000), value }))
        .filter((p): p is { time: number; value: number } => p !== null),
    }));

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      plugin: { id: plugin.id, name: plugin.name, author: plugin.author, version: plugin.version },
      levels, // null when nothing is currently armed under this script
      series,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
