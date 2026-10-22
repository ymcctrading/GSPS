/**
 * GSPS — /api/scan-fanout
 *
 * Serves the scans' queued member fan-out (`lib/entitlements/fanout-queue.ts`):
 * visible results, monitors, alerts and the trade plans they create, for every
 * member, with this request's own budget instead of what a scan left over.
 * Called every minute from the database (pg_cron `gsps-scan-fanout`, migration
 * 0116) with the same bearer secret as every scheduled route. A call with
 * nothing pending reads one query and returns.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { WORKER_START_DEADLINE_MS, runFanOutQueue } from "@/lib/entitlements/fanout-queue";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await runFanOutQueue(createServiceClient(), {
    deadlineAt: startedAt + WORKER_START_DEADLINE_MS,
  });
  if (outcome.jobsServed + outcome.jobsSuperseded + outcome.jobsExpired > 0) {
    console.log(`[scan-fanout] ${JSON.stringify(outcome)} in ${Date.now() - startedAt}ms`);
  }
  return NextResponse.json(outcome);
}
