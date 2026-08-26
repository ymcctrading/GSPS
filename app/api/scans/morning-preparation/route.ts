/**
 * GSPS — /api/scans/morning-preparation
 *
 * The 6:00 AM ET "Morning Preparation" scheduled scan from
 * GSPS_TIER_ENTITLEMENT_SPEC.md -- included on every tier, and explicitly
 * does not consume any user's manual_dashboard_scan or guided_scan quota
 * (it never reserves against usage_ledger at all; see
 * lib/entitlements/scheduled-scan.ts). Cron-invoked with the same
 * `Authorization: Bearer CRON_SECRET` pattern as /api/market-scan.
 *
 * Scheduled via .github/workflows/morning-preparation-scan.yml (GitHub
 * Actions, not vercel.json -- both Vercel cron slots are already spent; see
 * docs/THIRD_PARTY_LIMITS.md) at a reduced scan budget -- see
 * lib/entitlements/scheduled-scan.ts's MORNING_SCAN_UNIVERSE_TOP for why and
 * how to restore full capacity once a higher-tier plan is in place.
 */

import { NextRequest } from "next/server";
import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runScheduledScan(req.headers.get("authorization"), "scheduled_morning_scan");
}
