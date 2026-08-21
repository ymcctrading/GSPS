/**
 * GSPS — /api/onboarding
 *
 * Whether the first-run tour has been shown to this user, and the record that
 * it has. Two verbs and no business logic: the interesting decisions all live in
 * `lib/onboarding/status.ts`.
 *
 * GET answers for the signed-in user. A caller with no session gets `seen: true`
 * with a 200 rather than a 401, which looks like a lie and is not: the question
 * this endpoint answers is "should I interrupt this person with a tour", and for
 * someone who is not signed in the answer is no. Returning an error would push
 * that judgement into the client, where the natural handling of a failed fetch
 * ("assume unseen") is the one that pops a tour over a signed-out page.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  onboardingRecord,
  resolveOnboarding,
  UNSEEN,
  type OnboardingStatus,
} from "@/lib/onboarding/status";
import { resetDemoAccountIfStale } from "@/lib/demo/reset";

/** Nobody to show a tour to. Shaped like a real status so the client is uniform. */
const NO_SESSION: OnboardingStatus = { ...UNSEEN, seen: true };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(NO_SESSION);

  // The showcase demo profile always looks first-run: whatever
  // `settings.prefs.onboarding` remembers from a previous visitor is ignored,
  // and this is also the earliest point after sign-in (TourProvider fires it
  // on mount) to catch a trading day rollover, so the account's daily reset
  // happens here too rather than waiting for a portfolio poll.
  const demo = await resetDemoAccountIfStale(supabase, user.id);
  if (demo.isDemo) return NextResponse.json(UNSEEN);

  const { data, error } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();

  // A failed read must not auto-launch the tour over the top of someone
  // mid-task: an unreachable database is not evidence that they are new.
  if (error) return NextResponse.json(NO_SESSION);

  return NextResponse.json(resolveOnboarding((data as { prefs?: unknown } | null)?.prefs ?? null));
}

const OutcomeSchema = z.object({ outcome: z.enum(["completed", "skipped"]) });

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = OutcomeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected an outcome of completed or skipped." }, { status: 400 });
  }

  // Merge rather than replace: `prefs` is shared with the Guided caps and
  // anything else that lands there later, and finishing a tour must not drop a
  // key this route has never heard of.
  const { data: existing } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const prefs = ((existing as { prefs?: Record<string, unknown> } | null)?.prefs ?? {}) as Record<string, unknown>;

  const { error } = await supabase.from("settings").upsert(
    {
      user_id: user.id,
      prefs: { ...prefs, onboarding: onboardingRecord(parsed.data.outcome) },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json(resolveOnboarding({ onboarding: onboardingRecord(parsed.data.outcome) }));
}
