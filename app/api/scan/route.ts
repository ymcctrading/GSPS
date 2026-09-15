/**
 * GSPS v2.0 — /api/scan route (Next.js App Router)
 * -----------------------------------------------------
 * Usage:
 *   GET /api/scan?ticker=AAPL
 *   GET /api/scan?ticker=AAPL&optionPremium=1.85
 */

import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { redactScanResult } from "@/lib/scoring/public-summary";
import { verifyAuth } from "@/lib/auth";
import { recordScanVerdict } from "@/lib/learning/record";
import { createServiceClient } from "@/lib/supabase/server";
import { getUniversePolicy } from "@/lib/universe/policy";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { evaluateMonitorsAndNotify } from "@/lib/entitlements/scan-fanout";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const optionPremiumParam = searchParams.get("optionPremium");
  const optionPremium = optionPremiumParam ? Number(optionPremiumParam) : undefined;

  if (!ticker) {
    return NextResponse.json({ error: "Missing required 'ticker' query param" }, { status: 400 });
  }

  const { universe } = await getUniversePolicy(createServiceClient());
  const result = await scanTicker(ticker, optionPremium, undefined, undefined, universe);

  // A verdict is the input the learning tables were built to accumulate, and
  // until now nothing ever wrote one. Recorded for signed-in callers only: the
  // rows are per-user and RLS-scoped, so an anonymous scan has no row to own.
  // Failures are swallowed inside the recorder — a scan that produced an answer
  // must not 500 because telemetry could not be stored.
  const userId = await verifyAuth();
  if (userId) {
    await recordScanVerdict(userId, result, {
      // The bar this scan actually ran on — `EXECUTION_TIMEFRAME`
      // (lib/timeframe.ts), not a hardcoded "15Min" that would mislabel
      // learning-table rows the moment the 2026-09-09 override is in effect.
      timeframe: EXECUTION_TIMEFRAME,
      bar: result.executionBar,
    });

    // docs/GSPS_TIER_ENTITLEMENT_SPEC.md's "Eligible monitor sources" names
    // "Manually requested single-ticker scans, subject to monitor capacity"
    // as one of six sources meant to feed the Watch -> Execute monitor
    // system — but this route never called into it, so a symbol a user
    // scanned one at a time here never showed up on the Scanner page's
    // History tab or produced a WATCH -> EXECUTE notification the way the
    // same setup found via a manual dashboard batch scan would. Wired the
    // same way app/api/batch-scan/route.ts already does for
    // `manual_dashboard`, just for this route's single result. Best-effort:
    // a monitor-write failure must not turn an already-computed scan into
    // an error response.
    await applyMonitorForSingleTickerScan(userId, result).catch((err) => {
      console.error("[scan] monitor wiring failed:", err);
    });
  }

  // The per-criterion breakdown is the scoring model; only its rollup ships.
  return NextResponse.json(redactScanResult(result));
}

async function applyMonitorForSingleTickerScan(userId: string, result: ScanResult): Promise<void> {
  const service = createServiceClient();
  const policy = await getUserEntitlementPolicy(service, userId);

  const { data: execution, error: executionError } = await service
    .from("scan_executions")
    .insert({
      profile_id: userId,
      source: "single_ticker",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      eligible_count: !result.error && result.direction !== "none" ? 1 : 0,
      visible_count: !result.error && result.decision.outputState !== "Reject" && result.direction !== "none" ? 1 : 0,
      result_fresh_as_of: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (executionError || !execution) {
    console.error(`[scan] scan execution not recorded — ${executionError?.message}`);
    return;
  }

  // Mirrors app/api/batch-scan/route.ts's own qualifying/rejected split: a
  // real Execute/Watch setup is monitor-eligible, and a Reject (or a scan
  // error, which has no reliable direction/state to act on) invalidates an
  // existing monitor for this symbol rather than creating a new one.
  const qualifies = !result.error && result.decision.outputState !== "Reject" && result.direction !== "none";

  const visible: RankedSetup<ScanResult>[] = qualifies
    ? [{ side: result.direction === "bullish" ? "buy" : "sell", rank: result.decision.score, value: result }]
    : [];
  const rejectedSymbols = new Set(!result.error && !qualifies ? [result.symbol] : []);

  await evaluateMonitorsAndNotify(service, {
    profileId: userId,
    source: "single_ticker",
    scanExecutionId: execution.id as string,
    visible,
    rejectedSymbols,
    maxActiveWatchMonitors: policy.maxActiveWatchMonitors,
  });
}
