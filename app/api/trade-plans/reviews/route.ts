/**
 * GSPS — /api/trade-plans/reviews
 * GET: structured reviews (plan adherence + Rules Alignment breakdown) for
 * every one of the signed-in user's own trade plans that has reached a
 * terminal state. This is the list-view counterpart to the existing
 * per-plan `/api/trade-plans/[planId]/review` — see AGENTS.md's Polarity-
 * audit section: both routes existed, and neither had a UI consumer, until
 * the "Trade Reviews" panel (components/portfolio/trade-reviews.tsx) was
 * added. Available to every tier — this is a personal reflection tool over
 * the user's own already-generated plans, not a gated capability.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPostCloseReview, listTradePlans, TERMINAL_STATES } from "@/lib/lifecycle";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const plans = await listTradePlans(supabase, user.id);
  const terminal = plans.filter((p) => TERMINAL_STATES.includes(p.state));
  const reviews = terminal.map((plan) => ({
    instrument: plan.instrument,
    direction: plan.direction,
    generatedAt: plan.generatedAt,
    closedAt: plan.closedAt,
    review: buildPostCloseReview(plan),
  }));

  return NextResponse.json({ reviews });
}
