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
import { manageAllSimulatedExits } from "@/lib/trade/exit-manager-sim";
import { evaluateAllRestingOrders } from "@/lib/brokers/simulator";
import { isCronAuthorized } from "@/lib/cron-auth";
import { markAllPaperEquity } from "@/lib/portfolio/paper-equity";
import { placeAutomatedPyramidAdds } from "@/lib/automation/pyramid-adds";

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
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // Exits first: a stop read this pass frees its capital and its market
  // before the manager looks for anything new to open.
  const exits = await manageAllSimulatedExits(supabase as unknown as Parameters<typeof manageAllSimulatedExits>[0]);
  // Then the resting entries whose price has come, so a fill this pass is in
  // the book the manager reads before it opens anything new.
  const resting = await evaluateAllRestingOrders(supabase as unknown as Parameters<typeof evaluateAllRestingOrders>[0]);
  // Then Gann's pyramid adds on the lines automation opened
  // (lib/automation/pyramid-adds.ts), after the exits so a stopped line takes
  // no add, and before the manager so an add counts in the book it reads.
  const pyramid = await placeAutomatedPyramidAdds(supabase as unknown as Parameters<typeof placeAutomatedPyramidAdds>[0]).catch(
    (err: unknown) => ({ lines: 0, placed: 0, notes: [] as string[], errors: [String(err)] }),
  );
  const result = await runAutonomousPortfolioManager(supabase);
  // Last, every paper account's equity is marked on the book as it now stands
  // (lib/portfolio/paper-equity.ts).
  const equityMarks = await markAllPaperEquity(supabase).catch((err: unknown) => ({
    accounts: 0,
    recorded: 0,
    error: String(err),
  }));
  if (equityMarks.error) console.error(`automation/portfolio-manager/run: equity marks — ${equityMarks.error}`);
  return NextResponse.json({ ...result, exits, resting, pyramid, equityMarks });
}
