/**
 * GSPS — /api/shadow/summary
 *
 * Phase 7 ("Validation and monitoring") of the Claude Code Build Roadmap
 * spec pack. Owner only (`lib/auth/owner.ts`, 2026-10-28). Read-only:
 * reports how the shadow-tracked live Execute-tier signals (lib/shadow/record.ts, recorded from the trusted scheduled scan
 * only — see lib/entitlements/scheduled-scan.ts) have actually performed
 * over a trailing window, beside the baseline: the Execute row of the newest
 * committed production-faithful replay (`currentReplayBaseline()`,
 * `lib/shadow/compare.ts`), with its sample and window. A drift verdict is
 * given only when that replay ran the current `STRATEGY_VERSION`; a replay of
 * earlier rules is shown for reference and marked not comparable (R-032).
 * `replayBaseline` is null when no production run is committed.
 *
 * Until 2026-11-09 the page sent a hand-typed baseline as query params (31
 * trades, +0.151R, six stocks, Aug 27 rules); that row was retired (numbers
 * audit) and the params are no longer read.
 *
 * Usage:
 *   GET /api/shadow/summary
 *   GET /api/shadow/summary?windowDays=30
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  compareToBacktest,
  summarizeShadowRows,
  SHADOW_TRADE_OUTCOMES,
  currentReplayBaseline,
  EXECUTE_TIER_BACKTEST_BASELINE,
} from "@/lib/shadow/compare";
import { publicVersionLabel } from "@/lib/backtest/publicVersion";
import { SHADOW_MAX_HOLD_DAYS } from "@/lib/shadow/evaluate";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import { ownerOf } from "@/lib/auth/owner";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The forward test's record is the owner's alone until it is verified
  // (lib/auth/owner.ts); anyone else gets a 404, so the route discloses nothing.
  if (!ownerOf(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const windowDaysParam = searchParams.get("windowDays");
  const windowDays = windowDaysParam ? Number(windowDaysParam) : 60;
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    return NextResponse.json({ error: "windowDays must be a positive number" }, { status: 400 });
  }

  const service = createServiceClient();
  const since = new Date(Date.now() - windowDays * 24 * 3600_000).toISOString();

  const [{ data: evaluated, error: evaluatedError }, { count: pendingCount, error: pendingError }] =
    await Promise.all([
      // Trades on this strategy version only: a plan that never filled is not one,
      // and a sample mixing versions measures no rule production runs (R-032).
      service
        .from("shadow_signals")
        .select("outcome, r_multiple")
        .eq("strategy_version", STRATEGY_VERSION)
        .in("outcome", [...SHADOW_TRADE_OUTCOMES])
        .gte("scanned_at", since),
      service
        .from("shadow_signals")
        .select("id", { count: "exact", head: true })
        .eq("strategy_version", STRATEGY_VERSION)
        .is("outcome", null)
        .gte("scanned_at", since),
    ]);

  if (evaluatedError || pendingError) {
    console.error(`shadow summary: read failed — ${evaluatedError?.message ?? pendingError?.message}`);
    return NextResponse.json({ error: "Shadow signal data unavailable" }, { status: 503 });
  }

  const shadow = summarizeShadowRows((evaluated ?? []) as { outcome: "win" | "loss" | "timeout"; r_multiple: number }[]);

  const run = currentReplayBaseline();
  const comparable = run !== null && run.strategyVersion === STRATEGY_VERSION;
  const drift = comparable && EXECUTE_TIER_BACKTEST_BASELINE ? compareToBacktest(shadow, EXECUTE_TIER_BACKTEST_BASELINE) : null;
  const replayBaseline = run
    ? {
        trades: run.execute.trades,
        winRate: run.execute.winRate,
        expectancyR: run.execute.expectancyR,
        ci95: run.execute.ci95,
        symbols: run.symbols,
        timeframe: run.timeframe,
        window: run.window,
        // The version names stay on the server; the page reads the label only.
        version: publicVersionLabel(run.strategyVersion),
        comparable,
      }
    : null;

  return NextResponse.json({
    windowDays,
    maxHoldDays: SHADOW_MAX_HOLD_DAYS,
    shadow,
    pending: pendingCount ?? 0,
    replayBaseline,
    drift,
  });
}
