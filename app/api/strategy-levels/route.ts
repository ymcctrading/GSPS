/**
 * GSPS — /api/strategy-levels
 *
 * Computes one non-Gann Strategy Mode's entry/stop/TP1/master-target for a
 * symbol (AGENTS.md's "Strategy Modes" section; docs/STRATEGY_MODES.md).
 * Never wired into scanning, scoring, SignalGates, or Automation — this
 * route exists solely to feed the order ticket's optional Strategy Mode
 * display when a human has explicitly selected one for this ticket.
 *
 * `mode=gann` (or an unrecognized mode) is deliberately refused, not
 * silently satisfied some other way — a caller asking for the Gann trade
 * plan already has it from the scan result (`ScanResult.levels`); this
 * route's whole purpose is the opt-in, non-default modes.
 *
 * Tier-gated (2026-09-23, direct project-owner instruction): Novice has no
 * Strategy Mode access at all; Pro is scoped to MACD/RSI/EMA+SMA/VWAP;
 * Expert and Wall Street get every mode. See
 * `lib/entitlements/policy.ts#allowedStrategyModes` and
 * `lib/strategies/access.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, parseTimeframe } from "@/lib/timeframe";
import { evaluateStrategyMode, isNonGannStrategyMode } from "@/lib/strategies/registry";
import { isStrategyModeAllowedForPolicy } from "@/lib/strategies/access";
import { STRATEGY_MODE_LABELS, type StrategyModeId } from "@/lib/strategies/types";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";

// Same reasoning as /api/bars and /api/indicators: a symbol fetch can queue
// behind the shared per-provider rate limiter, and 3 retries with backoff on
// a 429/5xx can exceed Vercel Hobby's 10s default.
export const maxDuration = 60;

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
  const mode = searchParams.get("mode");
  const timeframe = parseTimeframe(searchParams.get("timeframe"), "5Min");

  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }
  if (!mode || !isNonGannStrategyMode(mode)) {
    return NextResponse.json(
      { error: `'mode' must be one of: ${Object.keys(STRATEGY_MODE_LABELS).filter((m) => m !== "gann").join(", ")}` },
      { status: 400 },
    );
  }

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  if (!isStrategyModeAllowedForPolicy(policy, mode)) {
    return NextResponse.json(
      { error: `Your plan doesn't include the '${mode}' strategy mode.` },
      { status: 403 },
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

    const levels = evaluateStrategyMode(mode, bars);
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      mode: mode as StrategyModeId,
      label: STRATEGY_MODE_LABELS[mode as StrategyModeId],
      levels, // null when nothing is currently armed under this mode
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
