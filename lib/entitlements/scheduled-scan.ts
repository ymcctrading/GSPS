/**
 * Phase 4: shared trusted-job plumbing for the 6:00 AM and 9:15 AM ET
 * scheduled scans from docs/GSPS_TIER_ENTITLEMENT_SPEC.md. Both routes
 * (app/api/scans/morning-preparation, app/api/scans/morning-confirmation)
 * call this with only their `source` value differing.
 *
 * Beyond the original Phase 3D scope (run the scan, leave one audit row),
 * this now:
 *  - is idempotent per (source, market date ET) via `scan_executions`'s
 *    partial unique index (migration 0040) -- a GitHub Actions retry, a
 *    manual re-invocation, or two racing workflow runs land the same
 *    scan_executions row, not a second one.
 *  - fans the scan's qualifying setups out to every profile via
 *    lib/entitlements/scan-fanout.ts, applying that profile's tier-specific
 *    visible-result cap, monitor lifecycle, and notification delivery --
 *    the same server-authoritative pipeline app/api/batch-scan/route.ts
 *    uses for a user-initiated scan. Never consumes manual_dashboard_scan
 *    or guided_scan quota: this is system work, not a user action.
 *  - fails closed (503) on a market-data provider failure rather than
 *    persisting a partial/empty run as if it succeeded.
 *
 * The scan work itself reuses lib/marketScan.ts's runMarketScan() -- the
 * same engine the existing 08:30/17:30 ET `/api/market-scan` crons call --
 * since it's the only system-wide scan implementation that exists. Both
 * Vercel cron slots are already spent (docs/THIRD_PARTY_LIMITS.md), so these
 * two jobs are scheduled via GitHub Actions instead --
 * .github/workflows/morning-preparation-scan.yml and
 * morning-confirmation-scan.yml, following the existing
 * premarket-scan.yml pattern. That's the cron-slot question; it's separate
 * from provider call volume (below).
 *
 * Runs at runMarketScan()'s full default budget (universeTop=100,
 * perSide=15), the same as the existing 08:30/17:30 ET crons -- these two
 * jobs were originally throttled to a smaller universe pending confirmation
 * that four full scans/day stays under every provider's rate limit
 * end-to-end. Restored to full capacity 2026-08-26: with a single active
 * user, the extra two scans/day add negligible request volume against
 * Alpaca's (the primary provider's) ~200 req/min, no-documented-daily-cap
 * limit. Revisit -- reintroduce a reduced budget, e.g. via an explicit
 * `runMarketScan(20, 5)` call -- once concurrent usage grows enough that
 * four full scans/day could plausibly approach a real provider ceiling
 * (docs/THIRD_PARTY_LIMITS.md has the actual per-provider numbers).
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runMarketScan } from "@/lib/marketScan";
import { createServiceClient } from "@/lib/supabase/server";
import { isTradingDay } from "@/lib/market/calendar";
import { etDateKey } from "@/lib/market/session";
import { getEntitlementPolicy } from "@/lib/entitlements/policy";
import { fanOutForProfile } from "@/lib/entitlements/scan-fanout";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { ScanResult } from "@/lib/types";
import type { PlatformTier } from "@/lib/tiers";
import { isPreviewEnvironment } from "@/lib/env/preview";
import { getUniversePolicy } from "@/lib/universe/policy";
import { recordShadowSignals } from "@/lib/shadow/record";
import { evaluatePendingShadowSignals } from "@/lib/shadow/evaluate";

export type ScheduledScanSource = "scheduled_morning_scan" | "scheduled_morning_confirmation_scan";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Same bearer-secret pattern as `/api/market-scan` (app/api/AGENTS.md's
 * "Cron-invoked endpoints" section) -- keep it identical so both jobs are
 * authorized the same way as every other trusted job in this codebase.
 */
function isAuthorized(authorizationHeader: string | null): boolean {
  return Boolean(process.env.CRON_SECRET) && authorizationHeader === `Bearer ${process.env.CRON_SECRET}`;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Single structured log line per invocation, emitted at every exit path --
 * covers the "Add observability" requirement (run identifier, job type,
 * intended ET market date, branch/environment, outcome, failure reason,
 * eligible/visible counts, idempotency outcome) without a logging
 * dependency this project doesn't otherwise have. One JSON object per line
 * so it's greppable/parseable from Vercel's log stream as-is.
 */
function logRunOutcome(args: {
  runId: string;
  source: ScheduledScanSource;
  marketDateEt: string | null;
  outcome: "unauthorized" | "preview_skip" | "non_trading_day" | "already_run" | "upstream_unavailable" | "persist_failed" | "completed";
  environment: string;
  eligibleCount?: number;
  profilesFannedOut?: number;
  profilesFailed?: number;
  totalNotified?: number;
}): void {
  console.log(
    JSON.stringify({
      event: "scheduled_scan_run",
      runId: args.runId,
      jobType: args.source,
      marketDateEt: args.marketDateEt,
      environment: args.environment,
      outcome: args.outcome,
      eligibleCount: args.eligibleCount,
      profilesFannedOut: args.profilesFannedOut,
      profilesFailed: args.profilesFailed,
      totalNotified: args.totalNotified,
    }),
  );
}

export async function runScheduledScan(
  authorizationHeader: string | null,
  source: ScheduledScanSource,
): Promise<NextResponse> {
  const runId = randomUUID();
  const environment = process.env.VERCEL_ENV ?? "unknown";

  if (!process.env.CRON_SECRET) {
    console.error(`${source}: CRON_SECRET is not set — the scheduled scan cannot run`);
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isAuthorized(authorizationHeader)) {
    logRunOutcome({ runId, source, marketDateEt: null, outcome: "unauthorized", environment });
    return unauthorized();
  }

  if (isPreviewEnvironment()) {
    logRunOutcome({ runId, source, marketDateEt: null, outcome: "preview_skip", environment });
    return NextResponse.json({ skipped: "preview_environment", source, runId });
  }

  const now = new Date();
  if (!isTradingDay(now)) {
    logRunOutcome({ runId, source, marketDateEt: etDateKey(now), outcome: "non_trading_day", environment });
    return NextResponse.json({ skipped: "non_trading_day", source, runId });
  }

  const marketDateEt = etDateKey(now);
  const service = createServiceClient();

  // Idempotency check-before-write: cheap and covers the common case (a
  // manual re-invocation after a successful run). The unique index
  // (migration 0040) is the actual guarantee against a concurrent racing
  // run -- this lookup just avoids doing the expensive scan work first only
  // to discard it on a 23505 below.
  const { data: existingRun } = await service
    .from("scan_executions")
    .select("id, eligible_count, visible_count")
    .eq("source", source)
    .eq("market_date_et", marketDateEt)
    .is("profile_id", null)
    .maybeSingle();
  if (existingRun) {
    logRunOutcome({ runId, source, marketDateEt, outcome: "already_run", environment });
    return NextResponse.json({
      skipped: "already_run",
      source,
      runId,
      marketDateEt,
      scanExecutionId: existingRun.id,
    });
  }

  let output;
  try {
    const { universe } = await getUniversePolicy(service);
    output = await runMarketScan(undefined, undefined, universe);
  } catch (err) {
    // Fail closed: an upstream provider failure must not grant access to a
    // stale/partial signal or silently record an empty successful run.
    console.error(`${source}: market scan failed — ${String(err)}`);
    logRunOutcome({ runId, source, marketDateEt, outcome: "upstream_unavailable", environment });
    return NextResponse.json({ error: "Upstream market data unavailable", source, runId }, { status: 503 });
  }

  const qualifying: RankedSetup<ScanResult>[] = [
    ...output.bullish.map((r) => ({ side: "buy" as const, rank: r.decision.score, value: r })),
    ...output.bearish.map((r) => ({ side: "sell" as const, rank: r.decision.score, value: r })),
  ];
  const eligibleCount = qualifying.length;

  // A symbol this run actually gave a full multi-timeframe pass and found
  // clean (no armed pattern, or no directional trade plan) is the same
  // "Reject" signal app/api/batch-scan/route.ts derives from its own scan
  // results -- so an existing monitor on it invalidates the same way. A
  // symbol the reduced universe never looked at this run is NOT in
  // `fullScanResults` and is correctly left alone (see the header comment
  // above `fanOutToProfiles`).
  const rejectedSymbols = new Set(
    output.fullScanResults
      .filter((r) => !r.error && (r.decision.outputState === "Reject" || r.direction === "none"))
      .map((r) => r.symbol),
  );

  const { data: inserted, error: insertError } = await service
    .from("scan_executions")
    .insert({
      profile_id: null,
      source,
      market_date_et: marketDateEt,
      started_at: now.toISOString(),
      finished_at: new Date().toISOString(),
      // eligible/visible are equal on the shared system row -- per-profile
      // visibility is recorded on each profile's own visible_scan_results
      // rows below, not reflected back onto this row.
      eligible_count: eligibleCount,
      visible_count: eligibleCount,
      result_fresh_as_of: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      // Lost a race to a concurrent run of the same job/market-date -- the
      // other run owns this scan; nothing left for this invocation to do.
      logRunOutcome({ runId, source, marketDateEt, outcome: "already_run", environment });
      return NextResponse.json({ skipped: "already_run", source, runId, marketDateEt });
    }
    console.error(`${source}: scan execution not recorded — ${insertError.message}`);
    logRunOutcome({ runId, source, marketDateEt, outcome: "persist_failed", environment });
    return NextResponse.json({ error: "Failed to record scan execution", source, runId }, { status: 503 });
  }

  const scanExecutionId = (inserted as { id: string }).id;
  const fanOut = await fanOutToProfiles(service, {
    scanExecutionId,
    source,
    qualifying,
    rejectedSymbols,
  });

  // Phase 7 ("Validation and monitoring") shadow-mode tracking -- best-effort
  // and deliberately outside the fan-out's own error handling, so a failure
  // here can never be mistaken for the actual scan/fan-out failing. Riding
  // the existing trusted schedule rather than a new cron slot (both of
  // Vercel Hobby's are spent, see docs/THIRD_PARTY_LIMITS.md): every run
  // records today's Execute-tier calls and evaluates whichever earlier
  // signals have now had a full trading day to develop, so no separate
  // evaluation job is needed. See lib/shadow/{record,evaluate}.ts.
  try {
    await recordShadowSignals(service, qualifying.map((q) => q.value), source);
    await evaluatePendingShadowSignals(service, now);
  } catch (err) {
    console.error(`${source}: shadow-mode tracking failed — ${String(err)}`);
  }

  logRunOutcome({
    runId,
    source,
    marketDateEt,
    outcome: "completed",
    environment,
    eligibleCount,
    profilesFannedOut: fanOut.profilesFannedOut,
    profilesFailed: fanOut.profilesFailed,
    totalNotified: fanOut.totalNotified,
  });

  return NextResponse.json({
    source,
    runId,
    marketDateEt,
    scanDate: output.scanDate,
    universeSize: output.universeSize,
    shortlisted: output.shortlisted,
    scanErrors: output.scanErrors,
    eligibleCount,
    scanExecutionId,
    profilesFannedOut: fanOut.profilesFannedOut,
    profilesFailed: fanOut.profilesFailed,
    totalNotified: fanOut.totalNotified,
  });
}

/**
 * Fans the shared scan's qualifying setups out to every profile, applying
 * each profile's own tier-derived visible-result cap and monitor capacity.
 * One profile's failure is logged and skipped, never allowed to abort the
 * rest of the run -- a scheduled job serving hundreds of profiles cannot
 * let one bad row take the whole batch down.
 *
 * `rejectedSymbols` (built by the caller from `output.fullScanResults`) is
 * the same profile-independent set for every profile in this loop -- a
 * symbol either got a full scan and came back clean this run, or it
 * didn't, regardless of who's watching it. A symbol this run's reduced
 * universe never looked at at all is correctly *not* in that set and is
 * left alone -- distinct from "looked at and found nothing," which is what
 * `fullScanResults` (unlike `bullish`/`bearish` alone) makes possible to
 * tell apart. See lib/marketScan.ts#MarketScanOutput.fullScanResults.
 */
async function fanOutToProfiles(
  service: ReturnType<typeof createServiceClient>,
  args: {
    scanExecutionId: string;
    source: ScheduledScanSource;
    qualifying: RankedSetup<ScanResult>[];
    rejectedSymbols: Set<string>;
  },
): Promise<{ profilesFannedOut: number; profilesFailed: number; totalNotified: number }> {
  const { data: profiles, error } = await service.from("profiles").select("id, tier");
  if (error || !profiles) {
    console.error(`${args.source}: could not list profiles for fan-out — ${error?.message}`);
    return { profilesFannedOut: 0, profilesFailed: 0, totalNotified: 0 };
  }

  let profilesFannedOut = 0;
  let profilesFailed = 0;
  let totalNotified = 0;

  for (const profile of profiles as { id: string; tier: PlatformTier | null }[]) {
    const policy = getEntitlementPolicy(profile.tier ?? "PRACTICE");
    const scheduleEnabled =
      args.source === "scheduled_morning_scan"
        ? policy.morningPreparationScanEnabled
        : policy.morningConfirmationScanEnabled;
    if (!scheduleEnabled) continue;

    try {
      const outcome = await fanOutForProfile(service, {
        profileId: profile.id,
        scanExecutionId: args.scanExecutionId,
        source: args.source,
        qualifying: args.qualifying,
        rejectedSymbols: args.rejectedSymbols,
        maxDashboardSetupsPerScan: policy.maxDashboardSetupsPerScan,
        maxActiveWatchMonitors: policy.maxActiveWatchMonitors,
      });
      profilesFannedOut += 1;
      totalNotified += outcome.notifiedCount;
    } catch (err) {
      profilesFailed += 1;
      console.error(`${args.source}: fan-out failed for profile ${profile.id} — ${String(err)}`);
    }
  }

  return { profilesFannedOut, profilesFailed, totalNotified };
}
