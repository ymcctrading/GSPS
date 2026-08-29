/**
 * GSPS — /api/trade-plans/[planId]/events
 * POST: apply one lifecycle event (qualify, arm, enter, tp1_fill, ...) to a
 * trade plan. See lib/lifecycle/transitions.ts for the rules each event
 * enforces — an event the current state doesn't allow comes back as 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyEventAndPersist, PlanEventSchema } from "@/lib/lifecycle";

export async function POST(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = PlanEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid event" }, { status: 400 });
  }

  const { planId } = await params;
  const result = await applyEventAndPersist(supabase, user.id, planId, parsed.data);

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ plan: result.plan });
}
