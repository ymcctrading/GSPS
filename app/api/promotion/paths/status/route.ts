/**
 * GSPS — /api/promotion/paths/status
 *
 * Read side of the generalized three-path tier-promotion model
 * (`lib/promotion/paths.ts`) — covers all three transitions
 * (Novice→Pro, Pro→Expert, Expert→Wall Street), each independently
 * clearable through Curriculum, Track Record, or Pay-to-play.
 *
 * `?transition=` is optional; omitted, it defaults to the caller's own next
 * transition (`nextTransitionFor` on their current tier). Requesting a
 * transition that isn't the caller's own next rung (already past it, or not
 * yet reached) returns `eligible: null` with an empty path breakdown rather
 * than computing anything — never gives false readiness for a rung a
 * profile isn't currently standing at.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { nextTransitionFor, TIER_TRANSITIONS, type TierTransition } from "@/lib/promotion/transitions";
import { DEFAULT_TRACK_RECORD_POLICIES } from "@/lib/promotion/trackRecordPolicy";
import { gatherTrackRecordInputs } from "@/lib/promotion/readiness";
import { gatherCurriculumProgressInputs } from "@/lib/promotion/curriculumPolicy";
import { evaluatePromotionPaths } from "@/lib/promotion/paths";
import { applyDueTransitionPromotion, recordTransitionEligibilityIfNewlyMet } from "@/lib/promotion/promote";
import { PROMOTION_PRICE_PROPOSALS, isPromotionBillingEnabled } from "@/lib/billing/promotionPricing";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const requested = req.nextUrl.searchParams.get("transition");
  if (requested && !TIER_TRANSITIONS.includes(requested as TierTransition)) {
    return NextResponse.json({ error: `Unknown transition "${requested}"` }, { status: 400 });
  }

  const service = createServiceClient();
  const now = new Date();
  const tier = await getUserTier(service, user.id);
  const transition = (requested as TierTransition | null) ?? nextTransitionFor(tier);

  if (!transition || nextTransitionFor(tier) !== transition) {
    return NextResponse.json({ tier, transition, eligible: null, paths: null, promoted: false });
  }

  const promoted = await applyDueTransitionPromotion(service, user.id, transition, now);

  const policy = DEFAULT_TRACK_RECORD_POLICIES[transition];
  const [trackRecord, curriculum, { data: purchase }] = await Promise.all([
    gatherTrackRecordInputs(service, user.id, policy, now),
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
    payToPlayPurchased: purchase != null,
  });

  await recordTransitionEligibilityIfNewlyMet(service, user.id, transition, result.eligible, now);

  const { data: status } = await service
    .from("tier_promotions_status")
    .select("requested_at, effective_at, promoted_at, path_used")
    .eq("profile_id", user.id)
    .eq("transition", transition)
    .maybeSingle();

  return NextResponse.json({
    tier,
    transition,
    promoted,
    paths: result,
    requestedAt: status?.requested_at ?? null,
    effectiveAt: status?.effective_at ?? null,
    pricing: {
      proposal: PROMOTION_PRICE_PROPOSALS[transition],
      billingEnabled: isPromotionBillingEnabled(),
    },
  });
}
