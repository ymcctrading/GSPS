/**
 * GSPS — /api/settings/dashboard
 *
 * The member's choice of Dashboard sections (lib/dashboard/sections.ts), saved
 * under `settings.prefs.dashboard`.
 *
 * GET -> { layout }
 * PUT -> save. Body { order, hidden }. Merges into the prefs it read and
 *        refuses to write when that read failed, since `prefs` is shared.
 *
 * Signed-in users only, their own settings row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyDashboardLayout, DashboardLayoutSchema, readDashboardLayout } from "@/lib/dashboard/sections";

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
  return NextResponse.json({ layout: readDashboardLayout(loaded.prefs) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = DashboardLayoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That layout isn't valid." }, { status: 400 });

  const loaded = await load(supabase, user.id);
  if (!loaded.ok) return NextResponse.json({ error: READ_FAILED }, { status: 502 });

  const { prefs, layout } = applyDashboardLayout(loaded.prefs, parsed.data);
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save your layout. Try again." }, { status: 502 });
  return NextResponse.json({ layout });
}
