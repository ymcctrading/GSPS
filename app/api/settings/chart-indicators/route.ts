/**
 * GSPS — /api/settings/chart-indicators
 *
 * A member's chart indicator periods and saved presets (SYNTHESIZED_ROADMAP Q2
 * item 6). See lib/chart/indicatorParams.ts. Stored under
 * `settings.prefs.chartIndicators`. Display only: nothing here reaches a
 * score, plan or order.
 *
 * PUT takes one change at a time (`ChartIndicatorChangeSchema`):
 * - `{ params }` sets the periods in force;
 * - `{ savePreset }` saves (or replaces, by name) a preset;
 * - `{ deletePreset }` removes one by name.
 *
 * `prefs` is shared with other features (the trade style history the exit
 * managers read, Guided Mode, onboarding), so a PUT merges into the prefs it
 * read and refuses to write when that read failed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ChartIndicatorChangeSchema,
  applyChartIndicatorChange,
  resolveChartIndicatorPrefs,
} from "@/lib/chart/indicatorParams";

type LoadResult = { ok: true; prefs: Record<string, unknown> } | { ok: false };

async function load(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<LoadResult> {
  const { data, error } = await supabase.from("settings").select("prefs").eq("user_id", userId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, prefs: ((data as { prefs?: Record<string, unknown> } | null)?.prefs ?? {}) as Record<string, unknown> };
}

const READ_FAILED = "Couldn't read your settings. Nothing was changed; try again.";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const loaded = await load(supabase, user.id);
  if (!loaded.ok) return NextResponse.json({ error: READ_FAILED }, { status: 502 });
  return NextResponse.json(resolveChartIndicatorPrefs(loaded.prefs.chartIndicators));
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = ChartIndicatorChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those indicator settings aren't valid." }, { status: 400 });

  // Never write over prefs we could not read: `{}` in their place would erase
  // every other feature's settings.
  const loaded = await load(supabase, user.id);
  if (!loaded.ok) return NextResponse.json({ error: READ_FAILED }, { status: 502 });

  const result = applyChartIndicatorChange(loaded.prefs, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, prefs: result.prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(result.chartIndicators);
}
