/**
 * GSPS — /api/scans/morning-confirmation
 *
 * The 9:15 AM ET confirmation scan from GSPS_TIER_ENTITLEMENT_SPEC.md --
 * included on every tier, does not consume any user's manual_dashboard_scan
 * or guided_scan quota. Cron-invoked with the same
 * `Authorization: Bearer CRON_SECRET` pattern as /api/market-scan.
 *
 * Not yet wired to a GitHub Actions/Vercel schedule -- see
 * docs/THIRD_PARTY_LIMITS.md before adding one; both Vercel cron slots are
 * already spent.
 */

import { NextRequest } from "next/server";
import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runScheduledScan(req.headers.get("authorization"), "scheduled_morning_confirmation_scan");
}
