/**
 * GSPS — /api/admin/decision-gate
 *
 * The Q1 decision gate's numbers (lib/ops/decision-gate.ts) as JSON, for the
 * operator. Opened only by the scheduled jobs' `Authorization: Bearer
 * CRON_SECRET`: these are counts across every member, and GSPS has no member
 * role that should see them. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { buildDecisionGateReport } from "@/lib/ops/decision-gate";

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await buildDecisionGateReport(createServiceClient()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
