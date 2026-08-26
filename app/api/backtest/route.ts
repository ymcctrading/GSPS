/**
 * GET /api/backtest — replay the protocol's entry logic over historical bars.
 *
 *   ?symbols=SPY,AAPL      universe to replay (defaults to the batch-scan list)
 *   ?timeframe=15Min       execution timeframe patterns are detected on
 *   ?targetR=2             take-profit distance, in multiples of risk
 *   ?within=Execute        verdict bucket to attribute factors inside
 *   ?since=2026-06-15      replay only bars at or after this instant
 *   ?productionStop=1      walk the leeway/large-cap-widened stop instead of
 *                          the raw pattern one — see ReplayOptions.useProductionStop
 *   ?trades=1              return the dated, per-trade list for `within`
 *                          instead of the aggregate report — small on
 *                          purpose (one bucket, not the whole universe's
 *                          trades), for building a real trade-by-trade
 *                          timeline the aggregate numbers can't answer
 *
 * Not on a cron and it must not go on one: a run walks every bar of every
 * symbol and is far too slow for a scheduled hobby-plan invocation. It is
 * called on demand from the learning dashboard.
 *
 * Signed-in callers only. Unlike `/api/scan`, which serves anyone and merely
 * records a verdict when it can identify the caller, there is no anonymous
 * reading of this one: a request walks every bar of every symbol, holds a
 * function open for the whole run, and spends vendor quota that is metered per
 * project rather than per caller. Left open, one URL is an unauthenticated way
 * to exhaust both.
 */

import { NextRequest, NextResponse } from "next/server";
import { BUCKETS, collectRun, runBacktest, type Bucket } from "@/lib/backtest/run";
import { byOutputState } from "@/lib/backtest/replay";
import { isTimeframe } from "@/lib/timeframe";
import { verifyAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";

const DEFAULT_UNIVERSE = ["SPY", "AAPL", "AMD", "TSLA", "MSFT", "NVDA"];

/**
 * A run is O(bars × symbols) and holds the request open the whole time. Past
 * this many symbols the route reliably outlives the platform's function
 * timeout and the caller gets a gateway error instead of a partial answer, so
 * it is rejected up front with a message that says what to do about it.
 */
const MAX_SYMBOLS = 12;

export async function GET(req: NextRequest) {
  const userId = await verifyAuth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Phase 3F: backtesting is Wall Street (SYSTEM_MASTERY) only per
  // docs/GSPS_TIER_ENTITLEMENT_SPEC.md -- this route had no tier gate at all
  // before this, so every signed-in user could replay regardless of plan.
  const policy = await getUserEntitlementPolicy(createServiceClient(), userId);
  if (!policy.backtestingEnabled) {
    return NextResponse.json(
      { error: "Backtesting is available on the Wall Street plan." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);

  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const universe = symbols.length > 0 ? symbols : DEFAULT_UNIVERSE;

  if (universe.length > MAX_SYMBOLS) {
    return NextResponse.json(
      { error: `Too many symbols (${universe.length}). Replay at most ${MAX_SYMBOLS} at a time.` },
      { status: 400 },
    );
  }

  const timeframe = searchParams.get("timeframe") ?? "15Min";
  if (!isTimeframe(timeframe)) {
    return NextResponse.json({ error: `Invalid timeframe '${timeframe}'` }, { status: 400 });
  }

  const targetRaw = searchParams.get("targetR");
  const targetR = targetRaw === null ? 2 : Number(targetRaw);
  if (!Number.isFinite(targetR) || targetR <= 0) {
    return NextResponse.json({ error: `Invalid targetR '${targetRaw}'` }, { status: 400 });
  }

  const within = searchParams.get("within") ?? "Execute";
  if (!BUCKETS.includes(within as Bucket)) {
    return NextResponse.json({ error: `Invalid bucket '${within}'` }, { status: 400 });
  }

  // Rejected rather than ignored. A silently dropped `since` would report a
  // two-year run under a heading claiming two months, which is the one kind of
  // wrong answer this endpoint must never give.
  const since = searchParams.get("since");
  if (since !== null && Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: `Invalid since '${since}'` }, { status: 400 });
  }

  const productionStopRaw = searchParams.get("productionStop");
  const useProductionStop = productionStopRaw !== null && productionStopRaw !== "0" && productionStopRaw !== "false";
  const wantTrades = searchParams.get("trades") === "1";

  try {
    if (wantTrades) {
      const run = await collectRun({
        symbols: universe,
        timeframe,
        targetR,
        ...(since !== null ? { since } : {}),
      });
      const bucketTrades = byOutputState(run.overall)[within as Bucket].trades;
      return NextResponse.json({
        source: run.source,
        live: run.live,
        timeframe: run.timeframe,
        targetR: run.targetR,
        symbols: run.symbols,
        skipped: run.skipped,
        window: run.window,
        bucket: within,
        trades: bucketTrades.map((t) => ({
          symbol: t.symbol,
          openedAt: t.openedAt,
          direction: t.direction,
          entry: t.entry,
          stop: t.stop,
          target: t.target,
          rMultiple: t.rMultiple,
          outcome: t.outcome,
        })),
      });
    }

    const report = await runBacktest({
      symbols: universe,
      timeframe,
      targetR,
      attributeWithin: within as Bucket,
      ...(since !== null ? { since } : {}),
      ...(useProductionStop ? { useProductionStop } : {}),
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
