import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Trader Operating System — a private, editable per-learner baseline +
 * recurring self-audit. Process/discipline tool only, never diagnostic:
 * validation below rejects nothing on content grounds (a learner's own
 * words are their own words) but the UI copy and this route's docstring
 * both make explicit this collects no clinical/mental-health data — only
 * process fields (objective, timeframes, risk limits, pause conditions,
 * a falsification prompt, and a post-trade classification enum).
 */
const RequestSchema = z.object({
  objective: z.string().max(2000).optional(),
  allowedTimeframes: z.array(z.string()).optional(),
  riskLimits: z.record(z.string(), z.unknown()).optional(),
  cognitiveRisks: z.array(z.string()).optional(),
  pauseConditions: z.array(z.string()).optional(),
  preTradeFalsificationPrompt: z.string().max(2000).optional(),
  lastPostTradeClassification: z.enum(["followed_plan", "deviated", "no_trade", "review_required"]).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("school_trader_operating_system")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ traderOS: data ?? null });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const body = parsed.data;
  const { error } = await supabase.from("school_trader_operating_system").upsert(
    {
      user_id: user.id,
      objective: body.objective,
      allowed_timeframes: body.allowedTimeframes,
      risk_limits: body.riskLimits ?? {},
      cognitive_risks: body.cognitiveRisks,
      pause_conditions: body.pauseConditions,
      pre_trade_falsification_prompt: body.preTradeFalsificationPrompt,
      last_post_trade_classification: body.lastPostTradeClassification,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
