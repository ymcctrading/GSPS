/**
 * GSPS — /api/scans/first-90min-confirmation
 *
 * The 9:45 AM ET scan added alongside the existing 6:30 AM
 * (scheduled_morning_scan) and 9:15 AM (scheduled_morning_confirmation_scan)
 * jobs -- project owner direction: "we have a 15 min[ute] delay... run a
 * fresh scan at 9:45 to catch the larger moves that occur within the first
 * 90 min[utes] of the market opening." 9:45 ET is 15 minutes after the 9:30
 * open, which given the free feed's own ~15-minute delay means this scan's
 * bars are drawn from right around the opening bell itself -- the window a
 * scan run only at 6:00/9:15 (both before the open) or in the evening
 * (after the prior close) cannot see at all.
 *
 * Distinct `source` from the 9:15 job on purpose: runScheduledScan's
 * idempotency guard (migration 0040/0068) keys on (source, market_date_et)
 * -- reusing "scheduled_morning_confirmation_scan" here would have this job
 * silently skipped as "already run today" the moment 9:15's job completed.
 *
 * Scheduled via .github/workflows/first-90min-scan.yml (GitHub Actions, not
 * vercel.json -- both Vercel cron slots are already spent; see
 * docs/THIRD_PARTY_LIMITS.md). Same full-capacity budget as the other two
 * scheduled scans -- see lib/entitlements/scheduled-scan.ts's header comment.
 */

import { NextRequest } from "next/server";
import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runScheduledScan(req.headers.get("authorization"), "scheduled_first_90min_scan");
}
