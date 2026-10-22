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
 *
 * The same pass releases quota reservations a dead run left `reserved`
 * (review finding S-12; `releaseStaleReservations`). It is clock-driven
 * cleanup of the same shape, so it rides this schedule rather than taking a
 * new one. Its failure is reported in the response and never stops the plan
 * expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runLifecycleReaper } from "@/lib/lifecycle/reaper";
import { isCronAuthorized } from "@/lib/cron-auth";
import { releaseStaleReservations } from "@/lib/entitlements/quota";

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("lifecycle/reaper: CRON_SECRET is not set — the scheduled run cannot execute");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result = await runLifecycleReaper(supabase);

  let staleReservationsReleased: number | null = null;
  let staleReservationsError: string | undefined;
  try {
    staleReservationsReleased = await releaseStaleReservations(supabase);
  } catch (err) {
    staleReservationsError = err instanceof Error ? err.message : String(err);
    console.error("lifecycle/reaper:", staleReservationsError);
  }

  return NextResponse.json({ ...result, staleReservationsReleased, ...(staleReservationsError ? { staleReservationsError } : {}) });
}
