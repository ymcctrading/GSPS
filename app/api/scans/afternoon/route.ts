/**
 * GSPS — /api/scans/afternoon
 *
 * The ~2:00 PM ET scheduled scan, added alongside /api/scans/midday to
 * close the coverage gap between the 9:45 AM first-90min scan and the
 * 5:30 PM post-close run — this checkpoint covers the post-lunch-lull /
 * early-afternoon session, so a setup that builds through midday
 * consolidation and confirms in the afternoon isn't left unscanned for
 * three-plus hours. Project owner direction, 2026-09-17.
 *
 * Same shared plumbing as the other four full-universe scheduled scans —
 * see lib/entitlements/scheduled-scan.ts's header comment for the universe
 * budget, the `daily_scans` refresh, and the fan-out to every profile's
 * `active_monitors`.
 *
 * Scheduled via .github/workflows/afternoon-scan.yml (GitHub Actions, not
 * vercel.json — both Vercel cron slots are already spent; see
 * docs/THIRD_PARTY_LIMITS.md).
 */

import { NextRequest } from "next/server";
import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runScheduledScan(req.headers.get("authorization"), "scheduled_afternoon_scan");
}
