/**
 * GSPS — /api/school/picks
 *
 * The learner's own charts for the School (lib/school/picks.ts): 3 to 9
 * markets, at least one US stock, saved under `settings.prefs.schoolPicks`.
 *
 * GET -> { picks | null, min, max, questions, markets, keepNote }
 * PUT -> save. Body { symbols: string[] }. Merges into the prefs it read and
 *        refuses to write when that read failed, since `prefs` is shared.
 *
 * Signed-in users only, their own settings row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  KEEP_PICKS_NOTE,
  SCHOOL_PICKS_MAX,
  SCHOOL_PICKS_MIN,
  applySchoolPicks,
  normalizeSchoolPicks,
  readSchoolPicks,
} from "@/lib/school/picks";
import { MARKET_SUGGESTIONS, PICK_QUESTIONS } from "@/lib/school/pickPrompts";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type LoadResult = { ok: true; prefs: Record<string, unknown> } | { ok: false };

async function load(supabase: Supabase, userId: string): Promise<LoadResult> {
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
  return NextResponse.json({
    picks: readSchoolPicks(loaded.prefs),
    min: SCHOOL_PICKS_MIN,
    max: SCHOOL_PICKS_MAX,
    questions: PICK_QUESTIONS,
    markets: MARKET_SUGGESTIONS,
    keepNote: KEEP_PICKS_NOTE,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
  const normalized = normalizeSchoolPicks(body?.symbols);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const loaded = await load(supabase, user.id);
  if (!loaded.ok) return NextResponse.json({ error: READ_FAILED }, { status: 502 });

  const { prefs, picks } = applySchoolPicks(loaded.prefs, normalized.symbols);
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ picks });
}
