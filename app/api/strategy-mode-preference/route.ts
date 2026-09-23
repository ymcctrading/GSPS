/**
 * GSPS — /api/strategy-mode-preference
 *
 * A user's durable, cross-device default Strategy Mode (AGENTS.md's
 * "Strategy Modes" section; docs/STRATEGY_MODES.md) — which non-Gann
 * technique, if any, the order ticket/chart should default to generating
 * entry/stop/target levels from. Absent a saved row, an unrecognized stored
 * value, or a mode this user's tier no longer allows
 * (`lib/entitlements/policy.ts#allowedStrategyModes`), the effective default
 * is "gann" — i.e. no override, the existing Gann trade plan is what's
 * shown. Never read by the scan pipeline, the scorecard, or Automation —
 * this is a per-user display/order-ticket preference only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNonGannStrategyMode, NON_GANN_STRATEGY_EVALUATORS } from "@/lib/strategies/registry";
import { isStrategyModeAllowedForPolicy } from "@/lib/strategies/access";
import type { StrategyModeId } from "@/lib/strategies/types";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";

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

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  const allowedModes = (
    Object.keys(NON_GANN_STRATEGY_EVALUATORS) as StrategyModeId[]
  ).filter((m) => isStrategyModeAllowedForPolicy(policy, m));

  const { data, error } = await supabase
    .from("strategy_mode_preferences")
    .select("mode")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const savedMode = data?.mode;
  const mode =
    savedMode &&
    isNonGannStrategyMode(savedMode) &&
    isStrategyModeAllowedForPolicy(policy, savedMode)
      ? savedMode
      : "gann";
  return NextResponse.json({ mode, allowedModes });
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

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  if (!isStrategyModeAllowedForPolicy(policy, mode)) {
    return NextResponse.json(
      { error: `Your plan doesn't include the '${mode}' strategy mode.` },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("strategy_mode_preferences")
    .upsert({ user_id: user.id, mode, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode });
}
