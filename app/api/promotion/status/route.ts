/**
 * GSPS — /api/promotion/status
 *
 * Read side of Pro (STANDARD) tier-promotion eligibility. Computes the full
 * Novice → Pro readiness checklist from real paper-trading history
 * (lib/promotion/readiness.ts), evaluates it against the remotely
 * configurable policy (lib/promotion/policy.ts), records the moment
 * eligibility was first reached, and applies any promotion whose scheduled
 * session has arrived (lib/promotion/promote.ts) — this project has no
 * cron slot free for that, so it happens lazily on read instead.
 *
 * Signed-in users only, always scoped to the caller's own profile.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { getPromotionPolicy } from "@/lib/promotion/policy";
import { gatherPromotionReadinessInputs } from "@/lib/promotion/readiness";
import { evaluatePromotionReadiness } from "@/lib/promotion/eligibility";
import { applyDuePromotion, recordEligibilityIfNewlyMet } from "@/lib/promotion/promote";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();

  const promoted = await applyDuePromotion(service, user.id, now);
  const tier = await getUserTier(service, user.id);

  if (tier !== "PRACTICE") {
    // Already Pro or above — no readiness checklist to compute or show.
    return NextResponse.json({ tier, promoted, eligible: null, requirements: [] });
  }

  const policy = await getPromotionPolicy(service);
  const inputs = await gatherPromotionReadinessInputs(service, user.id, policy, now);
  const readiness = evaluatePromotionReadiness(inputs, policy);

  await recordEligibilityIfNewlyMet(service, user.id, readiness.eligible, now);

  const { data: status } = await service
    .from("promotion_status")
    .select("requested_at, effective_at, promoted_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    tier,
    promoted,
    eligible: readiness.eligible,
    requirements: readiness.requirements,
    requestedAt: status?.requested_at ?? null,
    effectiveAt: status?.effective_at ?? null,
  });
}
