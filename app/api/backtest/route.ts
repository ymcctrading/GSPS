/**
 * GET /api/backtest — replay the protocol's entry logic over historical bars.
 *
 *   ?symbols=SPY,AAPL      universe to replay (defaults to the batch-scan list)
 *   ?timeframe=15Min       execution timeframe patterns are detected on
 *   ?targetR=2             take-profit distance, in multiples of risk
 *   ?within=Execute        verdict bucket to attribute factors inside, or
 *                          `all` for every trade — the unconditioned scope,
 *                          and the only one saturation can be read from (a
 *                          bucket is a slice the score itself selected, so
 *                          criteria saturate inside it by construction).
 *                          See UNCONDITIONED_ATTRIBUTION in lib/backtest/run.ts.
 *   ?scoreRange=5-6        attribute factors within a score band instead of a
 *                          verdict bucket — mutually exclusive with `within`
 *   ?since=2026-06-15      replay only bars at or after this instant
 *   ?productionStop=1      walk the leeway/large-cap-widened stop instead of
 *                          the raw pattern one — see ReplayOptions.useProductionStop
 *   ?slippageSensitivity=1 also run the request at 3x cost-per-share and report
 *                          the expectancy delta — a second full fetch/replay,
 *                          off by default. See BacktestRequest.includeSlippageSensitivity
 *   ?trades=1              return the dated, per-trade list for `within`
 *                          instead of the aggregate report — small on
 *                          purpose (one bucket, not the whole universe's
 *                          trades), for building a real trade-by-trade
 *                          timeline the aggregate numbers can't answer
 *   ?proposeWeights=1      run `lib/backtest/propose-weights.ts`'s chronological
 *                          in/out-of-sample weight study instead of the
 *                          aggregate report, and return its proposal against
 *                          the current DEFAULT_CRITERION_WEIGHTS. Exists
 *                          because a real weight study needs the raw
 *                          per-trade criteria data `?trades=1` deliberately
 *                          does not expose (see above) — this runs the study
 *                          server-side instead of shipping that data out, so
 *                          the response is only the aggregated proposal, not
 *                          per-trade criteria. Mutually exclusive with
 *                          `trades=1`. `scripts/propose-weights-report.mjs`
 *                          does the identical thing from a local checkout
 *                          with vendor credentials; this is the same study
 *                          for a caller who only has a browser.
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
import {
  BUCKETS,
  UNCONDITIONED_ATTRIBUTION,
  collectRun,
  isAttributionScope,
  runBacktest,
  type Bucket,
} from "@/lib/backtest/run";
import { byOutputState, byScoreRange } from "@/lib/backtest/replay";
import { proposeWeights } from "@/lib/backtest/propose-weights";
import { replaySignalEngineForUniverse } from "@/lib/backtest/replaySignals";
import { isTimeframe } from "@/lib/timeframe";
import { verifyAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { DEFAULT_CRITERION_WEIGHTS, EXECUTE_SCORE_THRESHOLD, WATCH_SCORE_THRESHOLD } from "@/lib/scoring/weights";

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

  const withinRaw = searchParams.get("within");
  const scoreRangeRaw = searchParams.get("scoreRange");
  if (withinRaw !== null && scoreRangeRaw !== null) {
    return NextResponse.json(
      { error: "'within' and 'scoreRange' are mutually exclusive — pass one." },
      { status: 400 },
    );
  }

  const within = withinRaw ?? "Execute";
  if (!isAttributionScope(within)) {
    return NextResponse.json(
      { error: `Invalid bucket '${within}' — expected one of ${BUCKETS.join(", ")}, or 'all'` },
      { status: 400 },
    );
  }

  let scoreRange: [number, number] | undefined;
  if (scoreRangeRaw !== null) {
    const m = /^(\d+)-(\d+)$/.exec(scoreRangeRaw);
    if (!m) {
      return NextResponse.json(
        { error: `Invalid scoreRange '${scoreRangeRaw}' — expected 'min-max', e.g. '5-6'` },
        { status: 400 },
      );
    }
    scoreRange = [Number(m[1]), Number(m[2])];
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
  const wantProposeWeights = searchParams.get("proposeWeights") === "1";
  const wantSignalEngine = searchParams.get("engine") === "signal";
  const includeSlippageSensitivity = searchParams.get("slippageSensitivity") === "1";

  if ([wantTrades, wantProposeWeights, wantSignalEngine].filter(Boolean).length > 1) {
    return NextResponse.json(
      { error: "'trades', 'proposeWeights' and 'engine=signal' are mutually exclusive — pass one." },
      { status: 400 },
    );
  }

  try {
    // Evidence-gathering walk-forward over the Signal & Regime Engine
    // (lib/signals), parallel to the Gann/STRAT score's own replay above —
    // see lib/backtest/replaySignals.ts's header for why it reports tier
    // frequency rather than a simulated P&L.
    if (wantSignalEngine) {
      const result = await replaySignalEngineForUniverse(universe, timeframe);
      return NextResponse.json({
        timeframe,
        symbols: universe,
        skipped: result.skipped,
        aggregateTierCounts: result.aggregateTierCounts,
        aggregateTradeableCount: result.aggregateTradeableCount,
        aggregateEventCount: result.aggregateEventCount,
        perSymbol: result.results.map((r) => ({
          symbol: r.symbol,
          barsEvaluated: r.barsEvaluated,
          tierCounts: r.tierCounts,
          tradeableCount: r.tradeableCount,
          eventCount: r.events.length,
        })),
      });
    }

    if (wantProposeWeights) {
      const run = await collectRun({
        symbols: universe,
        timeframe,
        targetR,
        ...(since !== null ? { since } : {}),
      });
      const proposal = proposeWeights(run.overall.trades, { current: DEFAULT_CRITERION_WEIGHTS });
      return NextResponse.json({
        source: run.source,
        live: run.live,
        timeframe: run.timeframe,
        targetR: run.targetR,
        symbols: run.symbols,
        skipped: run.skipped,
        window: run.window,
        totalTrades: run.overall.trades.length,
        currentWeights: DEFAULT_CRITERION_WEIGHTS,
        currentThresholds: { EXECUTE_SCORE_THRESHOLD, WATCH_SCORE_THRESHOLD },
        proposal,
      });
    }

    if (wantTrades) {
      const run = await collectRun({
        symbols: universe,
        timeframe,
        targetR,
        ...(since !== null ? { since } : {}),
      });
      const bucketTrades = scoreRange
        ? byScoreRange(run.overall, scoreRange[0], scoreRange[1]).trades
        : within === UNCONDITIONED_ATTRIBUTION
          ? run.overall.trades
          : byOutputState(run.overall)[within as Bucket].trades;
      return NextResponse.json({
        source: run.source,
        live: run.live,
        timeframe: run.timeframe,
        targetR: run.targetR,
        symbols: run.symbols,
        skipped: run.skipped,
        window: run.window,
        bucket: scoreRange ? `score ${scoreRange[0]}-${scoreRange[1]}` : within,
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
      attributeWithin: within,
      ...(scoreRange ? { attributeScoreRange: scoreRange } : {}),
      ...(since !== null ? { since } : {}),
      ...(useProductionStop ? { useProductionStop } : {}),
      ...(includeSlippageSensitivity ? { includeSlippageSensitivity } : {}),
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
