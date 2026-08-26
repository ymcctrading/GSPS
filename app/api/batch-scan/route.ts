/**
 * GSPS v2.0 — /api/batch-scan route (Next.js App Router)
 * -------------------------------------------------------
 * Usage:
 *   GET /api/batch-scan
 *     -> runs the default "Batch 1" watchlist
 *
 *   GET /api/batch-scan?tickers=SPY,AAPL,TSLA
 *     -> runs your own custom list
 *
 * Phase 3C: this is the "manual dashboard scan" docs/GSPS_TIER_ENTITLEMENT_SPEC.md
 * meters and caps -- a multi-symbol scan, as opposed to /api/scan's
 * single-ticker plan, which the spec explicitly excludes from both the
 * quota and the result-visibility cap. Every call here (default watchlist or
 * a custom ticker list) consumes one manualDashboardScansPerDay unit and has
 * its qualifying Buy/Sell setups capped at the caller's
 * maxDashboardSetupsPerScan before any of it leaves the server.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";
import { redactScanResult } from "@/lib/scoring/public-summary";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy, type Limit } from "@/lib/entitlements/policy";
import { finalizeUsageReservation, reserveUsageSlot } from "@/lib/entitlements/quota";
import { selectVisibleResults, type RankedSetup } from "@/lib/entitlements/result-selection";
import { evaluateMonitor } from "@/lib/entitlements/monitor-store";
import { getEnabledChannels, recordNotificationDelivery } from "@/lib/entitlements/delivery";
import type { ScanResult } from "@/lib/types";

const DEFAULT_WATCHLIST = [
  "SPY", "AAPL", "AMD", "TSLA", "MSFT", "META",
  "NVDA", "AMZN", "GOOGL", "TTWO", "BTC/USD",
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers");
  const tickers = tickersParam
    ? tickersParam.split(",").map((t) => t.trim()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  // Server-side writes and the quota RPCs below require service_role -- see
  // supabase/migrations/0036_entitlement_usage_and_monitors.sql's grants.
  const service = createServiceClient();
  const policy = await getUserEntitlementPolicy(service, user.id);

  const reservation = await reserveUsageSlot(service, {
    profileId: user.id,
    usageKey: "manual_dashboard_scan",
    limit: policy.manualDashboardScansPerDay,
    requestId: randomUUID(),
  });

  if (reservation.status === "quota_exceeded") {
    return NextResponse.json(
      {
        error: "Daily manual dashboard scan limit reached for your plan.",
        manualDashboardScansPerDay: policy.manualDashboardScansPerDay,
        used: reservation.currentCount,
      },
      { status: 429 },
    );
  }
  const reservationId = reservation.reservationId!;

  try {
    // Run all scans in parallel so a 10-stock batch takes roughly as
    // long as a single scan, not 10x as long.
    const results = await Promise.all(tickers.map((ticker) => scanTicker(ticker)));

    const execute = results.filter((r) => r.decision.outputState === "Execute");
    const watch = results.filter((r) => r.decision.outputState === "Watch");
    const reject = results.filter((r) => r.decision.outputState === "Reject");

    // Only Execute/Watch results with a real direction are the "qualifying
    // ranked Buy/Sell setups" the entitlement spec caps. Reject rows and
    // failed tickers are operational/informational, not a metered resource,
    // and pass through unfiltered below.
    const qualifying: RankedSetup<ScanResult>[] = results
      .filter((r) => !r.error && r.decision.outputState !== "Reject" && r.direction !== "none")
      .map((r) => ({
        side: r.direction === "bullish" ? ("buy" as const) : ("sell" as const),
        rank: r.decision.score,
        value: r,
      }));

    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: policy.maxDashboardSetupsPerScan,
      noviceDirectionalBackfill: policy.maxDashboardSetupsPerScan === 6,
      isTopTier: policy.maxDashboardSetupsPerScan === 30,
    });

    const visibleSymbols = new Set(visible.map((v) => v.value.symbol));
    // Everything the client actually receives: visible qualifying setups,
    // plus the untouched Reject/error rows. A qualifying setup that didn't
    // make the cap is dropped here -- not merely hidden client-side -- so
    // there is nothing in the response payload for a client to recover.
    const responseResults = results.filter(
      (r) => r.error || r.decision.outputState === "Reject" || visibleSymbols.has(r.symbol),
    );

    const scanExecutionId = await persistScanExecution(service, {
      profileId: user.id,
      policyVersion: null,
      eligibleCount: qualifying.length,
      visibleCount: visible.length,
      visible,
    });

    if (scanExecutionId) {
      // Only visible results are monitor-eligible ("only visible entitled
      // results can be monitored") -- a qualifying setup the cap dropped
      // never reaches evaluateMonitor, so it can't be watched or alerted on
      // either. Reject/no-direction results for a symbol that already has
      // an open monitor invalidate it; a Reject with no existing monitor is
      // simply not evaluated at all -- there's nothing to invalidate.
      const rejectedSymbols = new Set(
        results.filter((r) => !r.error && (r.decision.outputState === "Reject" || r.direction === "none")).map((r) => r.symbol),
      );
      await evaluateMonitorsForScan(service, {
        profileId: user.id,
        source: "manual_dashboard",
        scanExecutionId,
        visible,
        rejectedSymbols,
        maxActiveWatchMonitors: policy.maxActiveWatchMonitors,
      });
    }

    await finalizeUsageReservation(service, {
      profileId: user.id,
      reservationId,
      status: "finalized",
    });

    return NextResponse.json({
      requestedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      summary: {
        execute: execute.length,
        watch: watch.length,
        reject: reject.length,
      },
      resultVisibility: metadata,
      // The per-criterion breakdown is the scoring model; only its rollup ships.
      results: responseResults.map(redactScanResult),
    });
  } catch (err) {
    // The scan attempt itself failed before producing anything -- release
    // the reservation rather than charge the user's daily quota for it.
    await finalizeUsageReservation(service, {
      profileId: user.id,
      reservationId,
      status: "released",
    }).catch(() => {
      // Best-effort: a failure here must not mask the original scan error.
    });
    throw err;
  }
}

async function persistScanExecution(
  service: ReturnType<typeof createServiceClient>,
  args: {
    profileId: string;
    policyVersion: string | null;
    eligibleCount: number;
    visibleCount: number;
    visible: RankedSetup<ScanResult>[];
  },
): Promise<string | null> {
  const { data: execution, error: executionError } = await service
    .from("scan_executions")
    .insert({
      profile_id: args.profileId,
      source: "manual_dashboard",
      policy_version: args.policyVersion,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      eligible_count: args.eligibleCount,
      visible_count: args.visibleCount,
      result_fresh_as_of: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (executionError || !execution) {
    console.error(`batch-scan: scan execution not recorded — ${executionError?.message}`);
    return null;
  }

  if (args.visible.length > 0) {
    const rows = args.visible.map((v, i) => ({
      scan_execution_id: execution.id,
      profile_id: args.profileId,
      symbol: v.value.symbol,
      side: v.side,
      rank: i + 1,
    }));

    const { error: resultsError } = await service.from("visible_scan_results").insert(rows);
    if (resultsError) {
      console.error(`batch-scan: visible scan results not recorded — ${resultsError.message}`);
    }
  }

  return execution.id as string;
}

/**
 * Phase 3E: evaluates a monitor for every visible setup (WATCH/EXECUTE) and
 * for every scanned-but-rejected symbol that already has an open monitor
 * (INVALIDATED). Records a notification delivery for each transition that
 * confirms WATCH -> EXECUTE. Best-effort throughout: a monitor/delivery
 * failure must not turn an otherwise-successful scan into an error response.
 */
async function evaluateMonitorsForScan(
  service: ReturnType<typeof createServiceClient>,
  args: {
    profileId: string;
    source: string;
    scanExecutionId: string;
    visible: RankedSetup<ScanResult>[];
    rejectedSymbols: Set<string>;
    maxActiveWatchMonitors: Limit;
  },
): Promise<void> {
  const notifyWorthy: { transitionId: string; symbol: string }[] = [];

  for (const setup of args.visible) {
    try {
      const result = await evaluateMonitor(service, {
        profileId: args.profileId,
        symbol: setup.value.symbol,
        source: args.source,
        candidateState: setup.value.decision.outputState === "Execute" ? "EXECUTE" : "WATCH",
        evaluationId: args.scanExecutionId,
        maxActiveWatchMonitors: args.maxActiveWatchMonitors,
      });
      if (result.outcome === "applied" && result.notify && result.transitionId) {
        notifyWorthy.push({ transitionId: result.transitionId, symbol: setup.value.symbol });
      }
    } catch (err) {
      console.error(`batch-scan: monitor evaluation failed for ${setup.value.symbol} — ${String(err)}`);
    }
  }

  for (const symbol of args.rejectedSymbols) {
    try {
      await evaluateMonitor(service, {
        profileId: args.profileId,
        symbol,
        source: args.source,
        candidateState: "INVALIDATED",
        evaluationId: args.scanExecutionId,
        maxActiveWatchMonitors: args.maxActiveWatchMonitors,
      });
    } catch (err) {
      console.error(`batch-scan: monitor invalidation failed for ${symbol} — ${String(err)}`);
    }
  }

  if (notifyWorthy.length === 0) return;

  const channels = await getEnabledChannels(service, args.profileId).catch((err) => {
    console.error(`batch-scan: enabled channels not resolved — ${String(err)}`);
    return [];
  });

  for (const { transitionId, symbol } of notifyWorthy) {
    for (const channel of channels) {
      try {
        await recordNotificationDelivery(service, {
          transitionId,
          profileId: args.profileId,
          channel,
          idempotencyKey: `${transitionId}:${channel}`,
        });
      } catch (err) {
        console.error(`batch-scan: delivery not recorded for ${symbol}/${channel} — ${String(err)}`);
      }
    }
  }
}
