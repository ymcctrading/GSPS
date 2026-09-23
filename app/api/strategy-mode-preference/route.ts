/**
 * GSPS — /api/strategy-mode-preference
 *
 * A user's durable, cross-device default Strategy Mode (AGENTS.md's
 * "Strategy Modes" section; docs/STRATEGY_MODES.md) — which non-Gann
 * technique, if any, the order ticket/chart should default to generating
 * entry/stop/target levels from. Absent a saved row, or an unrecognized
 * stored value, the default is "gann" — i.e. no override, the existing Gann
 * trade plan is what's shown. Never read by the scan pipeline, the
 * scorecard, or Automation — this is a per-user display/order-ticket
 * preference only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNonGannStrategyMode } from "@/lib/strategies/registry";

const SetPreferenceSchema = z.object({
  mode: z.string().min(1).max(40),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("strategy_mode_preferences")
    .select("mode")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mode = data?.mode && isNonGannStrategyMode(data.mode) ? data.mode : "gann";
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = SetPreferenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { mode } = parsed.data;
  if (mode !== "gann" && !isNonGannStrategyMode(mode)) {
    return NextResponse.json({ error: `Unknown strategy mode '${mode}'` }, { status: 400 });
  }

  const { error } = await supabase
    .from("strategy_mode_preferences")
    .upsert({ user_id: user.id, mode, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode });
}
