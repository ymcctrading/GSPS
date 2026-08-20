/**
 * GSPS — /api/onboarding/tips
 *
 * Which contextual tips this user has dismissed, and whether they want any.
 *
 * Separate from `/api/onboarding` because the two answer different questions at
 * different times: the tour status is read once when the shell mounts, while
 * tip state is read by whichever page happens to carry a tip. Folding them
 * together would make every page pay for the tour's lookup.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveTips, withDismissed, TIPS_DEFAULT, type TipState } from "@/lib/onboarding/status";
import { TIP_IDS } from "@/lib/onboarding/tips";

/**
 * Nobody to show a tip to. Unlike the tour's equivalent this reports tips as
 * *enabled* with none dismissed — a signed-out visitor renders no tips anyway
 * (there is no page carrying one), so the honest answer is the default state
 * rather than a suppression the client would then cache.
 */
const NO_SESSION: TipState = TIPS_DEFAULT;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(NO_SESSION);

  const { data, error } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json(NO_SESSION);

  return NextResponse.json(resolveTips((data as { prefs?: unknown } | null)?.prefs ?? null));
}

const BodySchema = z.union([
  // Dismiss one tip, forever.
  z.object({ dismiss: z.string().refine((id) => TIP_IDS.includes(id), "Unknown tip") }),
  // The global switch in Settings.
  z.object({ enabled: z.boolean() }),
]);

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { dismiss } or { enabled }." }, { status: 400 });
  }

  // Read-modify-write on the shared `prefs` blob, merging rather than
  // replacing — the same discipline the onboarding route uses, and for the
  // same reason: this column belongs to several features at once.
  const { data: existing } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const prefs = ((existing as { prefs?: Record<string, unknown> } | null)?.prefs ?? {}) as Record<
    string,
    unknown
  >;
  const current = resolveTips(prefs);

  const next: TipState =
    "dismiss" in parsed.data
      ? withDismissed(current, parsed.data.dismiss)
      : { ...current, enabled: parsed.data.enabled };

  const { error } = await supabase.from("settings").upsert(
    { user_id: user.id, prefs: { ...prefs, tips: next }, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json(next);
}
