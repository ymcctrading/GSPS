/**
 * GSPS — /api/promotion/upgrade
 *
 * A user's explicit request to move from Novice (PRACTICE) to Pro
 * (STANDARD) once eligible. Re-derives eligibility server-side rather than
 * trusting anything from the client — see docs/GSPS_TIER_ENTITLEMENT_SPEC.md's
 * "ordinary clients must not self-upgrade tiers" posture, which applies
 * here just as much as to the existing entitlement quotas. Never applies
 * immediately: `requestPromotion` schedules `effective_at` at the next
 * market open, per the spec pack's "not retroactively to defeat an entry
 * cap."
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { getPromotionPolicy } from "@/lib/promotion/policy";
import { gatherPromotionReadinessInputs } from "@/lib/promotion/readiness";
import { evaluatePromotionReadiness } from "@/lib/promotion/eligibility";
import { requestPromotion } from "@/lib/promotion/promote";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceClient();
  const tier = await getUserTier(service, user.id);
  if (tier !== "PRACTICE") {
    return NextResponse.json({ error: "Already Pro or above" }, { status: 409 });
  }

  const policy = await getPromotionPolicy(service);
  const inputs = await gatherPromotionReadinessInputs(service, user.id, policy);
  const readiness = evaluatePromotionReadiness(inputs, policy);

  const result = await requestPromotion(service, user.id, readiness.eligible);

  if (result.status === "not_eligible") {
    return NextResponse.json({ error: "Not yet eligible", requirements: readiness.requirements }, { status: 403 });
  }

  return NextResponse.json(result);
}
