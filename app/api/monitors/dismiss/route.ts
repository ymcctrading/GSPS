/**
 * GSPS — /api/monitors/dismiss
 * POST: manually remove one of the caller's own open (WATCH/EXECUTE)
 * monitors from tracking — the user-initiated counterpart to
 * app/api/monitors/invalidation-sweep/route.ts's automatic
 * WATCH/EXECUTE -> INVALIDATED transition. Used by the Dashboard's "Your
 * tracked Execute setups" card (lib/dashboard/trackedExecute.ts only reads
 * state = 'EXECUTE' rows, so retiring a monitor here removes it from that
 * list immediately).
 *
 * Lands on EXPIRED rather than INVALIDATED — INVALIDATED is a claim about
 * the market (price broke the stop), which this isn't; EXPIRED already
 * means "no longer tracked" without asserting why. A direct update rather
 * than `evaluateMonitor`'s decision machine: that machine exists to
 * reconcile a *new scan's* read against the monitor's history (cooldowns,
 * stale-evaluation ordering); this is a user override of an existing row,
 * not a competing evaluation of it.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const DismissSchema = z.object({ symbol: z.string().min(1).max(24) });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = DismissSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const symbol = parsed.data.symbol.toUpperCase();
  const service = createServiceClient();

  const { data: monitor, error: findError } = await service
    .from("active_monitors")
    .select("id")
    .eq("profile_id", user.id)
    .eq("symbol", symbol)
    .in("state", ["WATCH", "EXECUTE"])
    .maybeSingle();
  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 502 });
  }
  if (!monitor) {
    return NextResponse.json({ error: `No open monitor for ${symbol} to dismiss.` }, { status: 404 });
  }

  const { error: updateError } = await service
    .from("active_monitors")
    .update({ state: "EXPIRED", last_evaluated_at: new Date().toISOString() })
    .eq("id", monitor.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
