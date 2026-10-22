/**
 * GSPS — /api/demo/auto-trade
 *
 * Trades one tier's practice account (lib/demo/practice.ts), named by
 * `?tier=novice|pro|expert|wall-street` (Wall Street when absent, the one demo
 * account there was before 2026-10-22). One tier a call, so each run keeps to
 * the 60-second budget; pg_cron calls each tier in turn (migration 0106).
 * See lib/demo/auto-trade.ts
 * for the actual pipeline (it's Guided Decision Mode's own, run without a
 * user session). Invoked on a schedule by GitHub Actions
 * (.github/workflows/demo-auto-trade.yml), the same `Authorization: Bearer
 * CRON_SECRET` pattern /api/market-scan and /api/intraday-scan already use —
 * there is no free Vercel cron slot to add this to (both of the Hobby
 * plan's two are already spent).
 *
 * Uses the service-role client deliberately: this writes orders/positions
 * for an account that is never the caller, which is exactly what RLS exists
 * to block for every other route in this app.
 *
 * Also sweeps for any of the account's closed trades missing an LLM
 * critique (lib/demo/critique.ts) and writes them here rather than on a
 * separate schedule — trading and critiquing the results are naturally the
 * same cadence, and it saves a second cron slot neither Vercel nor this
 * project's GitHub Actions budget has to spare.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runDemoAutoTrade } from "@/lib/demo/auto-trade";
import { generateMissingCritiques } from "@/lib/demo/critique";
import { isCronAuthorized } from "@/lib/cron-auth";
import { practiceTierFrom } from "@/lib/demo/practice";

// Vercel Hobby hard-caps function execution at 60s regardless of what this
// says. buildRecommendations batches its live re-scans specifically to fit
// inside that ceiling — see MAX_CANDIDATES_SCANNED/GUIDED_SCAN_BATCH in
// lib/guided/config.ts — so this shouldn't come close to it in practice.
export const maxDuration = 60;

/** Cron entry point — same bearer-secret convention as /api/market-scan. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("demo/auto-trade: CRON_SECRET is not set — the scheduled run cannot execute");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierParam = req.nextUrl.searchParams.get("tier");
  const practice = tierParam ? practiceTierFrom(tierParam) : practiceTierFrom("wall-street");
  if (!practice) return NextResponse.json({ error: `Unknown tier: ${tierParam}` }, { status: 400 });

  const supabase = createServiceClient();
  const result = await runDemoAutoTrade(supabase, new Date(), practice.tier);

  const critiques = result.demoUserId
    ? await generateMissingCritiques(supabase, result.demoUserId)
    : { generated: 0, errors: 0 };

  return NextResponse.json({ ...result, critiques });
}
