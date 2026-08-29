/**
 * GSPS — /api/trade-plans
 * POST: create a new trade plan, at WATCHLIST.
 * GET:  list the user's trade plans (optionally filtered by `?state=`).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTradePlan, listTradePlans, NewTradePlanSchema } from "@/lib/lifecycle";
import type { PlanState } from "@/lib/lifecycle";

const VALID_STATES: readonly PlanState[] = [
  "watchlist",
  "qualified",
  "armed",
  "entered",
  "tp1_reached",
  "tp2_reached",
  "master_reached",
  "runner",
  "closed",
  "expired",
  "invalidated",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = NewTradePlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid trade plan" }, { status: 400 });
  }

  const plan = await createTradePlan(supabase, user.id, parsed.data);
  return NextResponse.json({ plan }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const stateParam = req.nextUrl.searchParams.get("state");
  if (stateParam && !VALID_STATES.includes(stateParam as PlanState)) {
    return NextResponse.json({ error: `Invalid state "${stateParam}"` }, { status: 400 });
  }

  const plans = await listTradePlans(supabase, user.id, stateParam ? { state: stateParam as PlanState } : undefined);
  return NextResponse.json({ plans });
}
