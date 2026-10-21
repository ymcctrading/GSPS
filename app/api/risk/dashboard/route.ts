/**
 * GSPS — /api/risk/dashboard
 * GET: the signed-in member's paper risk book (lib/risk/dashboard.ts): the
 * trading unit and the most one trade may risk, capital held, markets open,
 * open risk by position, the series of losses, the circuit breaker and the
 * drawdown. Read on the member's own client; every table it reads lets a
 * member read only their own rows. Display only: placement enforces.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readRiskDashboard } from "@/lib/risk/dashboard";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    return NextResponse.json(await readRiskDashboard(supabase, user.id));
  } catch (err) {
    console.error(`risk/dashboard: ${String(err)}`);
    return NextResponse.json({ error: "Your risk figures couldn't be read right now." }, { status: 503 });
  }
}
