/**
 * GSPS — /api/trade-plans/[planId]/review
 * GET: the post-close structured review (plan adherence, actual vs. planned
 * entry/exit, rule state, lesson tags). Only meaningful once the plan has
 * reached a terminal state — see lib/lifecycle/review.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPostCloseReview, getTradePlan, TERMINAL_STATES } from "@/lib/lifecycle";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { planId } = await params;
  const plan = await getTradePlan(supabase, user.id, planId);
  if (!plan) {
    return NextResponse.json({ error: "Trade plan not found" }, { status: 404 });
  }
  if (!TERMINAL_STATES.includes(plan.state)) {
    return NextResponse.json(
      { error: `Plan is still ${plan.state}; a review is only generated once it closes.` },
      { status: 409 },
    );
  }

  return NextResponse.json({ review: buildPostCloseReview(plan) });
}
