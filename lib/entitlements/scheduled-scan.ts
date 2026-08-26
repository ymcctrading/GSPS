/**
 * Phase 3D: shared trusted-job plumbing for the 6:00 AM and 9:15 AM ET
 * scheduled scans from GSPS_TIER_ENTITLEMENT_SPEC.md. Both routes
 * (app/api/scans/morning-preparation, app/api/scans/morning-confirmation)
 * call this with only their `source` value differing.
 *
 * This intentionally stops at "the job ran, on a real trading day, outside
 * preview, and left an audit row" -- it does not persist per-user visible
 * results or create/update monitors. That fan-out is Phase 3E's job: what a
 * profile is entitled to see from these runs and how a result becomes a
 * monitored Watch/Execute candidate are lifecycle questions this migration's
 * schema (0036) supports but doesn't yet decide.
 *
 * The scan work itself reuses lib/marketScan.ts's runMarketScan() -- the
 * same engine the existing 08:30/17:30 ET `/api/market-scan` crons call --
 * since it's the only system-wide scan implementation that exists. That
 * means two more full-universe scans per day (four total), which increases
 * provider call volume against the daily/per-minute caps in
 * docs/THIRD_PARTY_LIMITS.md. Flagged for review before either schedule is
 * actually enabled in production, not something to wave through silently.
 */

import { NextResponse } from "next/server";
import { runMarketScan } from "@/lib/marketScan";
import { createServiceClient } from "@/lib/supabase/server";
import { isTradingDay } from "@/lib/market/calendar";

export type ScheduledScanSource = "scheduled_morning_scan" | "scheduled_morning_confirmation_scan";

/**
 * `true` on a Vercel preview deployment. Preview must not trigger a real
 * schedule, an external notification, or a cost-amplifying scan -- there is
 * no cron trigger on preview anyway (Vercel Cron only fires in production),
 * but this route can still be hit manually with the right secret on a
 * preview URL, so the guard is enforced here too rather than assumed.
 */
function isPreviewEnvironment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

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

export async function runScheduledScan(
  authorizationHeader: string | null,
  source: ScheduledScanSource,
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error(`${source}: CRON_SECRET is not set — the scheduled scan cannot run`);
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isAuthorized(authorizationHeader)) return unauthorized();

  if (isPreviewEnvironment()) {
    return NextResponse.json({ skipped: "preview_environment", source });
  }

  const now = new Date();
  if (!isTradingDay(now)) {
    return NextResponse.json({ skipped: "non_trading_day", source });
  }

  const output = await runMarketScan();
  const eligibleCount = output.bullish.length + output.bearish.length;

  const service = createServiceClient();
  const { error } = await service.from("scan_executions").insert({
    profile_id: null,
    source,
    started_at: now.toISOString(),
    finished_at: new Date().toISOString(),
    // No per-user visibility cap applies to a system job with no profile --
    // eligible and visible are equal here until Phase 3E fans this out per
    // profile, at which point visible_count reflects each profile's cap.
    eligible_count: eligibleCount,
    visible_count: eligibleCount,
    result_fresh_as_of: new Date().toISOString(),
  });
  if (error) {
    console.error(`${source}: scan execution not recorded — ${error.message}`);
  }

  return NextResponse.json({
    source,
    scanDate: output.scanDate,
    universeSize: output.universeSize,
    shortlisted: output.shortlisted,
    scanErrors: output.scanErrors,
    eligibleCount,
  });
}
