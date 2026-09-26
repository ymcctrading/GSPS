/**
 * Server-only resolver for the guided domain's `policy_values` overrides
 * (domain "guided"), covering `lib/guided/config.ts`'s `GuidedPolicy` —
 * the platform-level ceilings/defaults an operator tunes (risk-percent
 * bounds, trade-count defaults, budget bounds, the minimum tradeable
 * quantity, recommendation TTL, and scan-batching limits) — same pattern
 * lib/risk/policy.ts and lib/universe/policy.ts established, reusing the
 * generic lib/policy/store.ts and the domain-scoped `policy_values` table
 * (supabase/migrations/0049_domain_policy_values.sql) with no new migration.
 *
 * Distinct from `GuidedCaps`: a user's own per-account risk/trade-count
 * preferences (`settings.prefs.guided`) are untouched by this resolver —
 * they are still read and clamped by `resolveGuidedCaps`, just against
 * whichever `GuidedPolicy` bounds this resolver produces instead of the
 * bare code constants.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicyOverrides, setPolicyValue, type PolicyBounds } from "@/lib/policy/store";
import { DEFAULT_GUIDED_POLICY, type GuidedPolicy } from "@/lib/guided/config";

const GUIDED_POLICY_DOMAIN = "guided";

export const GUIDED_POLICY_KEYS = Object.keys(DEFAULT_GUIDED_POLICY) as (keyof GuidedPolicy)[];

/** Sanity ranges for stored overrides (audit F4.3, 2026-09-26) — typo catchers, not tuning. */
export const GUIDED_POLICY_BOUNDS: PolicyBounds<GuidedPolicy> = {
  defaultRiskPct: { min: 0.05, max: 3 },
  minRiskPct: { min: 0.05, max: 3 },
  maxRiskPct: { min: 0.05, max: 3 },
  defaultMaxTradesPerDay: { min: 1, max: 20, integer: true },
  defaultMaxTradesPerWeek: { min: 1, max: 100, integer: true },
  defaultMaxDeployedPct: { min: 1, max: 100 },
  minGuidedBudgetUsd: { min: 10, max: 100_000 },
  maxGuidedBudgetUsd: { min: 10, max: 100_000 },
  defaultGuidedBudgetUsd: { min: 10, max: 100_000 },
  minGuidedQty: { min: 1, max: 100, integer: true },
  recommendationTtlMinutes: { min: 1, max: 240 },
  maxCandidatesScanned: { min: 1, max: 100, integer: true },
  guidedScanBatch: { min: 1, max: 50, integer: true },
  maxRecommendations: { min: 1, max: 20, integer: true },
};

/**
 * Resolves the effective guided policy: code defaults with any valid
 * `policy_values` (domain "guided") override applied on top. `supabase`
 * should be a service-role client — the table has no client select policy.
 */
export async function getGuidedPolicy(supabase: SupabaseClient): Promise<GuidedPolicy> {
  return getPolicyOverrides(
    supabase,
    GUIDED_POLICY_DOMAIN,
    DEFAULT_GUIDED_POLICY,
    GUIDED_POLICY_KEYS,
    GUIDED_POLICY_BOUNDS,
  );
}

/** Server/admin-only. Sets one guided-domain policy value, auditable via `policy_change_log`. */
export async function setGuidedPolicyValue(
  supabase: SupabaseClient,
  key: keyof GuidedPolicy,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  await setPolicyValue(supabase, GUIDED_POLICY_DOMAIN, key, value, updatedBy);
}
