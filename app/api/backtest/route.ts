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
 *                          the raw pattern one — see ReplayOptions.useProductionStop.
 *                          Changes nothing under the default reaction entry,
 *                          whose stop is the plan's own
 *   ?planLevels=0          trade a bracket built from `targetR` instead of the
 *                          plan production attaches. Default on (2026-10-28):
 *                          the plan's TP1 and its refusals (no plan, TP1 not
 *                          past the entry) as production applies them, so the
 *                          Test page measures what the app trades. See
 *                          ReplayOptions.usePlanLevels. `targetR` is then
 *                          unused, as it is under Gann's exits (the default),
 *                          which fix no target
 *   ?entryRule=stop        fill on the old resting stop or the retest-and-hold
 *   ?entryRule=confirmed   sequence instead of the reaction buy every path
 *                          uses since PLAN.md item 4. See ReplayOptions.entryRule
 *   ?tradeStyle=fast      Gann's fast-market method: the swing plan, its stop
 *                          trailed 3 points under each completed day's low
 *                          from the fill (Gann exits only). See
 *                          ReplayOptions.tradeStyle. Default swing.
 *   ?exitRule=gann        how open trades leave: bracket, gann (default,
 *                          production's LIVE_EXIT_RULE) or gann-runner. See ReplayOptions.exitRule
 *   ?disableExits=three_adverse_closes,prior_week
 *                          measurement only: switch named Gann exit rules off
 *                          inside the replay walk (needs exitRule gann or
 *                          gann-runner). An unknown name is a 400. See
 *                          ReplayOptions.disableExits
 *   ?reclaimPoints=5       how many of Gann's points a close must clear a broken
 *                          stop by for the plan to stand again: 3 (default, the
 *                          live scan's figure), 5 (the stricter reading) or 1
 *                          (the 1-point penetration, C-STOP-04). See
 *                          ReplayOptions.reclaimPoints
 *   ?profile=intraday      walk the replay-only intraday profile (Gann's rules read
 *                          from the run's own bars, unscored) instead of the
 *                          production method. See lib/backtest/replayIntraday.ts
 *   ?sessionClose=1        with profile=intraday, close what is left of each trade
 *                          at the session's last bar, as the Intraday style does
 *                          (lib/gann/intradayExit.ts). Equities only
 *   ?scaleOut=0            with profile=intraday, sell nothing at the first
 *                          target: the whole position runs on the stop and the
 *                          hourly turn, the Intraday style's live rule
 *   ?slippageSensitivity=1 also run the request at 3x cost-per-share and report
 *                          the expectancy delta — a second full fetch/replay,
 *                          off by default. See BacktestRequest.includeSlippageSensitivity
 *   ?trades=1              return the dated, per-trade list for `within`
 *                          instead of the aggregate report — small on
 *                          purpose (one bucket, not the whole universe's
 *                          trades), for building a real trade-by-trade
 *                          timeline the aggregate numbers can't answer
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

import { LIVE_EXIT_RULE } from "@/lib/trade/protocol-exit";
import { NextRequest, NextResponse } from "next/server";
import {
  BUCKETS,
  UNCONDITIONED_ATTRIBUTION,
  collectRun,
  isAttributionScope,
  runBacktest,
  type Bucket,
} from "@/lib/backtest/run";
import { byOutputState, byScoreRange, resolveDisableExits } from "@/lib/backtest/replay";
import { replaySignalEngineForUniverse } from "@/lib/backtest/replaySignals";
import { replayOvernightForUniverse } from "@/lib/backtest/replayOvernight";
import { toPublicReport } from "@/lib/backtest/factorLabels";
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

  const entryRuleRaw = searchParams.get("entryRule");
  if (entryRuleRaw !== null && entryRuleRaw !== "stop" && entryRuleRaw !== "confirmed" && entryRuleRaw !== "reaction") {
    return NextResponse.json({ error: `Invalid entryRule '${entryRuleRaw}' (stop | confirmed | reaction)` }, { status: 400 });
  }
  const entryRule = entryRuleRaw ?? undefined;

  // Only the two pre-registered readings (docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md
  // Part 5). Rejected rather than coerced, so no third value gets searched.
  const reclaimPointsRaw = searchParams.get("reclaimPoints");
  if (reclaimPointsRaw !== null && !["1", "3", "5"].includes(reclaimPointsRaw)) {
    return NextResponse.json({ error: `Invalid reclaimPoints '${reclaimPointsRaw}' (1 | 3 | 5)` }, { status: 400 });
  }
  const reclaimPoints = reclaimPointsRaw === null ? undefined : Number(reclaimPointsRaw);

  const exitRuleRaw = searchParams.get("exitRule");
  if (exitRuleRaw !== null && exitRuleRaw !== "bracket" && exitRuleRaw !== "gann" && exitRuleRaw !== "gann-runner") {
    return NextResponse.json({ error: `Invalid exitRule '${exitRuleRaw}' (bracket | gann | gann-runner)` }, { status: 400 });
  }
  const exitRule = exitRuleRaw ?? undefined;

  // The trade style walked (lib/trade/tradeStyle.ts): swing (default) or fast.
  const tradeStyleRaw = searchParams.get("tradeStyle");
  if (tradeStyleRaw !== null && tradeStyleRaw !== "swing" && tradeStyleRaw !== "fast") {
    return NextResponse.json({ error: `Invalid tradeStyle '${tradeStyleRaw}' (swing | fast)` }, { status: 400 });
  }
  const tradeStyle = tradeStyleRaw ?? undefined;

  // Measurement only (ReplayOptions.disableExits). Every name is checked: a
  // misspelt rule would otherwise report a cell identical to its baseline.
  const disableExitsRaw = searchParams.get("disableExits");
  let disableExits: ReturnType<typeof resolveDisableExits> | undefined;
  if (disableExitsRaw !== null) {
    try {
      disableExits = resolveDisableExits(
        disableExitsRaw.split(",").map((n) => n.trim()).filter((n) => n.length > 0),
        exitRule ?? LIVE_EXIT_RULE,
      );
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }
  const disableExitsOption = disableExits && disableExits.size > 0 ? { disableExits: [...disableExits] } : {};

  const profileRaw = searchParams.get("profile");
  if (profileRaw !== null && profileRaw !== "swing" && profileRaw !== "intraday") {
    return NextResponse.json({ error: `Invalid profile '${profileRaw}' (swing | intraday)` }, { status: 400 });
  }
  const profile = profileRaw === "intraday" ? ("intraday" as const) : undefined;
  const sessionClose = searchParams.get("sessionClose") === "1";
  if (sessionClose && profile !== "intraday") {
    return NextResponse.json({ error: "sessionClose applies to profile=intraday only" }, { status: 400 });
  }
  const scaleOutRaw = searchParams.get("scaleOut");
  const scaleOut = scaleOutRaw === "0" || scaleOutRaw === "false" ? false : undefined;
  if (scaleOut === false && profile !== "intraday") {
    return NextResponse.json({ error: "scaleOut applies to profile=intraday only" }, { status: 400 });
  }

  const planLevelsRaw = searchParams.get("planLevels");
  const usePlanLevels = !(planLevelsRaw === "0" || planLevelsRaw === "false");
  const productionStopRaw = searchParams.get("productionStop");
  const useProductionStop = productionStopRaw !== null && productionStopRaw !== "0" && productionStopRaw !== "false";
  const wantTrades = searchParams.get("trades") === "1";
  const wantSignalEngine = searchParams.get("engine") === "signal";
  const wantOvernight = searchParams.get("engine") === "overnight";
  const includeSlippageSensitivity = searchParams.get("slippageSensitivity") === "1";

  if ([wantTrades, wantSignalEngine].filter(Boolean).length > 1) {
    return NextResponse.json(
      { error: "'trades' and 'engine=signal' are mutually exclusive — pass one." },
      { status: 400 },
    );
  }

  try {
    // Evidence-gathering walk-forward over the Signal & Regime Engine
    // (lib/signals), parallel to the Gann/STRAT score's own replay above —
    // see lib/backtest/replaySignals.ts's header for why it reports tier
    // frequency rather than a simulated P&L.
    // Gann's Overnight method (Master Course Ch. 3) on daily bars, stop and
    // reverse included; `halfway=1` adds the worked log's half-way-point
    // entries. Measurement only. See lib/backtest/replayOvernight.ts.
    if (wantOvernight) {
      const halfwayEntries = searchParams.get("halfway") === "1";
      const result = await replayOvernightForUniverse(universe, { halfwayEntries });
      return NextResponse.json({
        engine: "overnight",
        halfwayEntries,
        symbols: universe,
        skipped: result.skipped,
        summary: result.summary,
        perSymbol: result.results.map((r) => ({ symbol: r.symbol, bars: r.bars, trades: r.trades.length })),
        ...(wantTrades ? { trades: result.results.flatMap((r) => r.trades.map((t) => ({ symbol: r.symbol, ...t }))) } : {}),
      });
    }

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

    if (wantTrades) {
      const run = await collectRun({
        symbols: universe,
        timeframe,
        targetR,
        usePlanLevels,
        ...(since !== null ? { since } : {}),
        ...(useProductionStop ? { useProductionStop } : {}),
        ...(entryRule ? { entryRule } : {}),
        ...(exitRule ? { exitRule } : {}),
        ...(tradeStyle ? { tradeStyle } : {}),
        ...disableExitsOption,
        ...(reclaimPoints !== undefined ? { reclaimPoints } : {}),
        ...(profile ? { profile } : {}),
        ...(sessionClose ? { sessionClose } : {}),
        ...(scaleOut === false ? { scaleOut } : {}),
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
      usePlanLevels,
      ...(entryRule ? { entryRule } : {}),
      ...(exitRule ? { exitRule } : {}),
      ...(tradeStyle ? { tradeStyle } : {}),
      ...disableExitsOption,
      ...(reclaimPoints !== undefined ? { reclaimPoints } : {}),
      ...(profile ? { profile } : {}),
      ...(sessionClose ? { sessionClose } : {}),
      ...(scaleOut === false ? { scaleOut } : {}),
      ...(includeSlippageSensitivity ? { includeSlippageSensitivity } : {}),
    });
    // The whitelisted report: plain factor names, no internal ids (lib/backtest/factorLabels.ts).
    return NextResponse.json(toPublicReport(report));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
