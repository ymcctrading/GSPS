/**
 * GSPS — /api/settings/chart-indicators
 *
 * A member's chart indicator periods and saved presets (SYNTHESIZED_ROADMAP Q2
 * item 6). See lib/chart/indicatorParams.ts. Stored under
 * `settings.prefs.chartIndicators`. Display only: nothing here reaches a
 * score, plan or order.
 *
 * PUT takes one change at a time:
 * - `{ params }` sets the periods in force;
 * - `{ savePreset }` saves (or replaces, by name) a preset;
 * - `{ deletePreset }` removes one by name.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ChartPresetSchema,
  IndicatorParamsSchema,
  MAX_PRESETS,
  PRESET_NAME_MAX,
  resolveChartIndicatorPrefs,
  resolveIndicatorParams,
} from "@/lib/chart/indicatorParams";

const PutSchema = z.union([
  z.object({ params: IndicatorParamsSchema }).strict(),
  z.object({ savePreset: ChartPresetSchema }).strict(),
  z.object({ deletePreset: z.string().trim().min(1).max(PRESET_NAME_MAX) }).strict(),
]);

async function load(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("settings").select("prefs").eq("user_id", userId).maybeSingle();
  return ((data as { prefs?: Record<string, unknown> } | null)?.prefs ?? {}) as Record<string, unknown>;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(resolveChartIndicatorPrefs((await load(supabase, user.id)).chartIndicators));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those indicator settings aren't valid." }, { status: 400 });

  // Merge rather than replace: `prefs` is shared with other features.
  const prefs = await load(supabase, user.id);
  const current = resolveChartIndicatorPrefs(prefs.chartIndicators);
  const body = parsed.data;
  const next = { ...current };
  if ("params" in body) {
    const params = resolveIndicatorParams(body.params);
    if (body.params.macd.fast >= body.params.macd.slow) {
      return NextResponse.json({ error: "MACD's fast period must be shorter than its slow one." }, { status: 400 });
    }
    next.params = params;
  } else if ("savePreset" in body) {
    if (body.savePreset.params.macd.fast >= body.savePreset.params.macd.slow) {
      return NextResponse.json({ error: "MACD's fast period must be shorter than its slow one." }, { status: 400 });
    }
    const key = body.savePreset.name.toLowerCase();
    const others = current.presets.filter((p) => p.name.toLowerCase() !== key);
    if (others.length >= MAX_PRESETS) {
      return NextResponse.json({ error: `You can keep up to ${MAX_PRESETS} presets. Delete one first.` }, { status: 400 });
    }
    next.presets = [...others, body.savePreset];
  } else {
    const key = body.deletePreset.toLowerCase();
    next.presets = current.presets.filter((p) => p.name.toLowerCase() !== key);
  }

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, prefs: { ...prefs, chartIndicators: next }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(next);
}
