/**
 * GSPS — /api/demo/auto-trade
 *
 * Trades the showcase demo profile automatically — see lib/demo/auto-trade.ts
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
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result = await runDemoAutoTrade(supabase);

  const critiques = result.demoUserId
    ? await generateMissingCritiques(supabase, result.demoUserId)
    : { generated: 0, errors: 0 };

  return NextResponse.json({ ...result, critiques });
}
