/**
 * GSPS — /api/shadow/summary
 *
 * Phase 7 ("Validation and monitoring") of the Claude Code Build Roadmap
 * spec pack. Read-only: reports how the shadow-tracked live Execute-tier
 * signals (lib/shadow/record.ts, recorded from the trusted scheduled scan
 * only — see lib/entitlements/scheduled-scan.ts) have actually performed
 * over a trailing window, and — when a backtest baseline is supplied —
 * whether that performance has drifted from what the backtest harness
 * predicts for the same strategy version.
 *
 * There is no live, cheap source of a backtest baseline to compare against
 * automatically: running `lib/backtest/run.ts` here would mean a full
 * vendor-data backtest on every summary request, which is exactly the cost
 * `scripts/replay-report.mjs` avoids by writing a committable report
 * instead (see docs/BACKTESTING.md). So the baseline is supplied by the
 * caller — e.g. the Execute-tier row from the latest docs/REPLAY_RESULTS.md,
 * or a fresh GET /api/backtest run — as query params. Omit them and this
 * still returns the shadow summary alone, with no drift verdict.
 *
 * Usage:
 *   GET /api/shadow/summary
 *   GET /api/shadow/summary?windowDays=30
 *   GET /api/shadow/summary?backtestTrades=31&backtestWinRate=0.387&backtestExpectancyR=0.151
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  compareToBacktest,
  summarizeShadowRows,
  type BacktestBaseline,
} from "@/lib/shadow/compare";
import { SHADOW_MAX_HOLD_DAYS } from "@/lib/shadow/evaluate";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
      service.from("shadow_signals").select("outcome, r_multiple").not("outcome", "is", null).gte("scanned_at", since),
      service
        .from("shadow_signals")
        .select("id", { count: "exact", head: true })
        .is("outcome", null)
        .gte("scanned_at", since),
    ]);

  if (evaluatedError || pendingError) {
    console.error(`shadow summary: read failed — ${evaluatedError?.message ?? pendingError?.message}`);
    return NextResponse.json({ error: "Shadow signal data unavailable" }, { status: 503 });
  }

  const shadow = summarizeShadowRows((evaluated ?? []) as { outcome: "win" | "loss" | "timeout"; r_multiple: number }[]);

  const backtestTrades = Number(searchParams.get("backtestTrades"));
  const backtestWinRate = Number(searchParams.get("backtestWinRate"));
  const backtestExpectancyR = Number(searchParams.get("backtestExpectancyR"));
  const hasBaseline =
    Number.isFinite(backtestTrades) && Number.isFinite(backtestWinRate) && Number.isFinite(backtestExpectancyR);

  let drift = null;
  if (hasBaseline) {
    const baseline: BacktestBaseline = {
      trades: backtestTrades,
      winRate: backtestWinRate,
      expectancyR: backtestExpectancyR,
    };
    drift = compareToBacktest(shadow, baseline);
  }

  return NextResponse.json({
    windowDays,
    maxHoldDays: SHADOW_MAX_HOLD_DAYS,
    shadow,
    pending: pendingCount ?? 0,
    baselineSupplied: hasBaseline,
    drift,
  });
}
