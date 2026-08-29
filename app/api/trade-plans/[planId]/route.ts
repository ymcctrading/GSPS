/**
 * GSPS — /api/trade-plans/[planId]
 * GET: one trade plan, with its full audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTradePlan } from "@/lib/lifecycle";

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

  return NextResponse.json({ plan });
}
