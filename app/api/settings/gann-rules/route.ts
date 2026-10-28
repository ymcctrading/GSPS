/**
 * GSPS — /api/settings/gann-rules
 *
 * The trader's switches for Gann's round-number notice, the twice-yearly rest
 * reminder, the close-out reminder before an absence (A-EXIT-05), and the autonomous portfolio manager's round-number setting. See
 * lib/gann/traderPrefs.ts. Stored under `settings.prefs.gannRules`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  AWAY_REMINDER_COPY,
  awayReminderDue,
  resolveGannRulePrefs,
  restReminderDue,
  REST_REMINDER_COPY,
  withStyleChange,
} from "@/lib/gann/traderPrefs";

const PatchSchema = z
  .object({
    roundNumberNotices: z.boolean(),
    restReminder: z.boolean(),
    autoOrderRoundNumbers: z.boolean(),
    restDismissedFor: z.string().regex(/^\d{4}-(06|12)$/).nullable(),
    awayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    // Swing only: Fast was retired (lib/trade/tradeStyle.ts, FAST_RETIRED_AT).
    tradeStyle: z.enum(["swing"]),
  })
  .partial();

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
  const prefs = resolveGannRulePrefs(await load(supabase, user.id));
  const rest = restReminderDue(prefs);
  const away = awayReminderDue(prefs);
  return NextResponse.json({
    prefs,
    restReminder: rest ? { ...rest, message: REST_REMINDER_COPY } : null,
    awayReminder: away ? { ...away, message: AWAY_REMINDER_COPY } : null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those settings aren't valid." }, { status: 400 });

  // Merge rather than replace: `prefs` is shared with other features.
  const prefs = await load(supabase, user.id);
  const current = resolveGannRulePrefs(prefs);
  const next = { ...current, ...parsed.data };
  // The style's history is the server's (a trade is managed in the style that
  // stood at its fill, lib/trade/exit-style.ts); the client never writes it.
  if (parsed.data.tradeStyle) next.tradeStyleHistory = withStyleChange(current, parsed.data.tradeStyle, new Date());
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, prefs: { ...prefs, gannRules: next }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ prefs: next });
}
