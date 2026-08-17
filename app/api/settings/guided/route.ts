/**
 * GSPS — /api/settings/guided
 *
 * The Guided Decision Mode caps: read them, and change them.
 *
 * Stored under `settings.prefs.guided` rather than in dedicated columns because
 * they are per-feature preferences, not protocol constants — the engine has no
 * opinion about how many trades a day a user should take. The bounds enforced
 * here are the same ones `resolveGuidedCaps` falls back on when it reads a value
 * it does not like, so a cap can never be widened past what the mode is willing
 * to honour by writing directly to the row either.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_RISK_PCT,
  MIN_RISK_PCT,
  resolveGuidedCaps,
  type GuidedCaps,
} from "@/lib/guided/config";

const CapsSchema = z.object({
  riskPct: z.number().min(MIN_RISK_PCT).max(MAX_RISK_PCT),
  maxTradesPerDay: z.number().int().min(1).max(20),
  maxTradesPerWeek: z.number().int().min(1).max(50),
  maxDeployedPct: z.number().min(5).max(100),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    caps: resolveGuidedCaps((data as { prefs?: unknown } | null)?.prefs ?? null),
    bounds: { riskPct: [MIN_RISK_PCT, MAX_RISK_PCT] },
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = CapsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Those limits are outside what Guided Mode allows." },
      { status: 400 },
    );
  }

  // Merge rather than replace: `prefs` is shared with everything else that
  // stores a preference there, and a settings save must not silently drop keys
  // this route has never heard of.
  const { data: existing } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const prefs = ((existing as { prefs?: Record<string, unknown> } | null)?.prefs ?? {}) as Record<string, unknown>;

  const caps: GuidedCaps = parsed.data;
  const { error } = await supabase
    .from("settings")
    .upsert(
      { user_id: user.id, prefs: { ...prefs, guided: caps }, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ caps });
}
