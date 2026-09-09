/**
 * GSPS — /api/lifecycle/reaper
 *
 * Scheduled entry point for `lib/lifecycle/reaper.ts` — see that module's
 * header for what this does and, as importantly, what it deliberately
 * doesn't. Invoked on a schedule by GitHub Actions
 * (`.github/workflows/lifecycle-reaper.yml`), the same
 * `Authorization: Bearer CRON_SECRET` pattern `/api/market-scan` and
 * `/api/automation/portfolio-manager/run` already use — there is no free
 * Vercel cron slot (both of the Hobby plan's two are already spent; see
 * docs/THIRD_PARTY_LIMITS.md).
 *
 * Uses the service-role client deliberately: this reads and writes
 * `trade_plans` rows across every user, which is exactly what RLS exists to
 * block for every other route in this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runLifecycleReaper } from "@/lib/lifecycle/reaper";

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("lifecycle/reaper: CRON_SECRET is not set — the scheduled run cannot execute");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result = await runLifecycleReaper(supabase);
  return NextResponse.json(result);
}
