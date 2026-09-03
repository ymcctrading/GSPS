/**
 * GSPS — /api/automation/portfolio-manager/run
 *
 * The scheduled entry point for the Automated Portfolio Manager
 * (`lib/automation/portfolio-manager.ts`) — the fully-autonomous,
 * non-plan-scoped engine behind `/automation`'s "Automated Portfolio
 * Manager" toggle. Invoked on a schedule by GitHub Actions
 * (`.github/workflows/autonomous-portfolio-manager.yml`), the same
 * `Authorization: Bearer CRON_SECRET` pattern `/api/market-scan` and
 * `/api/demo/auto-trade` already use — there is no free Vercel cron slot
 * (both of the Hobby plan's two are already spent; see
 * docs/THIRD_PARTY_LIMITS.md).
 *
 * Uses the service-role client deliberately: this writes automation
 * profiles and orders for accounts that are never the caller, which is
 * exactly what RLS exists to block for every other route in this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAutonomousPortfolioManager } from "@/lib/automation/portfolio-manager";

// Vercel Hobby hard-caps function execution at 60s regardless of what this
// says. This loop is per-user/per-plan database work with no external data
// fetch per candidate, so it should stay well inside that ceiling; revisit
// the loop's fan-out if the member base grows enough to change that.
export const maxDuration = 60;

/** Cron entry point — same bearer-secret convention as /api/market-scan. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("automation/portfolio-manager/run: CRON_SECRET is not set — the scheduled run cannot execute");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result = await runAutonomousPortfolioManager(supabase);
  return NextResponse.json(result);
}
