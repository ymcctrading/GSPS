/**
 * GSPS — /api/scans/midday
 *
 * The ~11:00 AM ET scheduled scan, added to close the coverage gap between
 * the 9:45 AM first-90min scan and the 5:30 PM post-close run — by then the
 * opening-range volatility (9:30-10:30 ET) has settled, so this is the
 * first reliable "is today's real trend confirmed" checkpoint, and the
 * first chance for a symbol that read Watch earlier in the morning to
 * confirm into Execute before the middle of the day passes with nothing
 * rechecking it. Project owner direction, 2026-09-17.
 *
 * Same shared plumbing as the other four full-universe scheduled scans —
 * see lib/entitlements/scheduled-scan.ts's header comment for the universe
 * budget, the `daily_scans` refresh, and the fan-out to every profile's
 * `active_monitors`.
 *
 * Scheduled via .github/workflows/midday-scan.yml (GitHub Actions, not
 * vercel.json — both Vercel cron slots are already spent; see
 * docs/THIRD_PARTY_LIMITS.md).
 */

import { NextRequest } from "next/server";
import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runScheduledScan(req.headers.get("authorization"), "scheduled_midday_scan");
}
