/**
 * GSPS — /api/settings/onboarding
 *
 * Persists the one flag the first-run "Take the tour" walkthrough needs:
 * whether this user has finished or dismissed it. Piggybacks on the existing
 * `settings.prefs` jsonb column (see 0001_initial_schema.sql) rather than a
 * new table — this is a single boolean plus a timestamp, not a shape that
 * earns its own migration.
 *
 * GET:  the user's onboarding prefs (defaults to "not seen yet" if the user
 *       has no settings row at all — most users won't until they change
 *       something elsewhere).
 * POST: merge-update the onboarding prefs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { OnboardingPrefs } from "@/lib/onboarding/tour";

const UpdateSchema = z.object({
  tourCompleted: z.boolean().optional(),
  tourDismissed: z.boolean().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const onboarding = ((data?.prefs as { onboarding?: OnboardingPrefs } | null)?.onboarding ??
      {}) as OnboardingPrefs;
    return NextResponse.json({ onboarding });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid onboarding update" }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const { data: existing, error: readError } = await supabase
      .from("settings")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;

    const prevPrefs = (existing?.prefs as Record<string, unknown> | null) ?? {};
    const prevOnboarding = (prevPrefs.onboarding as OnboardingPrefs | undefined) ?? {};

    const nextOnboarding: OnboardingPrefs = {
      ...prevOnboarding,
      ...(input.tourCompleted !== undefined && { tourCompleted: input.tourCompleted }),
      ...(input.tourDismissed && { tourDismissedAt: new Date().toISOString() }),
    };

    const { error: writeError } = await supabase
      .from("settings")
      .upsert(
        { user_id: user.id, prefs: { ...prevPrefs, onboarding: nextOnboarding } },
        { onConflict: "user_id" },
      );
    if (writeError) throw writeError;

    return NextResponse.json({ onboarding: nextOnboarding });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
