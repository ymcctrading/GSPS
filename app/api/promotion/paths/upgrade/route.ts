/**
 * GSPS — /api/promotion/paths/upgrade
 *
 * A user's explicit request to promote through a transition via a specific
 * path (curriculum, track_record, or pay_your_way), generalized version of
 * `/api/promotion/upgrade`. Re-derives eligibility server-side — never
 * trusts a client-supplied path or transition. Requesting a path the
 * profile isn't actually eligible through (even if a different path would
 * clear it) is refused: the caller picks which of their eligible paths to
 * promote through, this route does not silently substitute another.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { nextTransitionFor, PROMOTION_PATHS, TIER_TRANSITIONS, type TierTransition, type PromotionPath } from "@/lib/promotion/transitions";
import { DEFAULT_TRACK_RECORD_POLICIES } from "@/lib/promotion/trackRecordPolicy";
import { gatherTrackRecordInputs } from "@/lib/promotion/readiness";
import { gatherCurriculumProgressInputs } from "@/lib/promotion/curriculumPolicy";
import { evaluatePromotionPaths } from "@/lib/promotion/paths";
import { requestTransitionPromotion } from "@/lib/promotion/promote";

const RequestSchema = z.object({
  transition: z.enum(TIER_TRANSITIONS),
  path: z.enum(PROMOTION_PATHS),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { transition, path } = parsed.data as { transition: TierTransition; path: PromotionPath };

  const service = createServiceClient();
  const tier = await getUserTier(service, user.id);
  if (nextTransitionFor(tier) !== transition) {
    return NextResponse.json({ error: "Not currently eligible to attempt this transition" }, { status: 409 });
  }

  const policy = DEFAULT_TRACK_RECORD_POLICIES[transition];
  const [trackRecord, curriculum, { data: purchase }] = await Promise.all([
    gatherTrackRecordInputs(service, user.id, policy),
    gatherCurriculumProgressInputs(service, user.id),
    service
      .from("tier_promotion_purchases")
      .select("id")
      .eq("profile_id", user.id)
      .eq("transition", transition)
      .eq("status", "completed")
      .maybeSingle(),
  ]);

  const result = evaluatePromotionPaths(transition, {
    curriculum,
    trackRecord,
    trackRecordPolicy: policy,
    payYourWayPurchased: purchase != null,
  });

  if (!result.eligiblePaths.includes(path)) {
    return NextResponse.json(
      { error: `Not yet eligible for "${path}"`, paths: result },
      { status: 403 },
    );
  }

  const outcome = await requestTransitionPromotion(service, user.id, transition, path);
  return NextResponse.json(outcome);
}
