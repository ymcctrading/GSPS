/**
 * Server-only resolver/writer for the remotely configurable promotion
 * policy (`promotion_policy_values`), overlaid on the documented code
 * defaults in `lib/promotion/config.ts`.
 *
 * Fail-closed posture: any read error, missing row, or malformed value
 * falls back to the code default rather than throwing — a promotion
 * threshold is a ceiling on who gets promoted, so degrading to the
 * documented-safe default is the correct failure mode, never a wider one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROMOTION_POLICY, PROMOTION_POLICY_KEYS, type PromotionPolicy } from "@/lib/promotion/config";

interface PolicyValueRow {
  key: string;
  value: number;
}

/**
 * Resolves the effective promotion policy: code defaults with any valid
 * `promotion_policy_values` override applied on top. `supabase` should be a
 * service-role client — the table has no client select policy.
 */
export async function getPromotionPolicy(supabase: SupabaseClient): Promise<PromotionPolicy> {
  const { data, error } = await supabase
    .from("promotion_policy_values")
    .select("key, value")
    .in("key", PROMOTION_POLICY_KEYS);

  if (error || !data) {
    if (error) console.error(`promotion: policy override read failed, using defaults — ${error.message}`);
    return { ...DEFAULT_PROMOTION_POLICY };
  }

  const resolved = { ...DEFAULT_PROMOTION_POLICY };
  for (const row of data as PolicyValueRow[]) {
    const key = row.key as keyof PromotionPolicy;
    if (!PROMOTION_POLICY_KEYS.includes(key)) continue;
    const value = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(value)) continue;
    resolved[key] = value;
  }
  return resolved;
}

/**
 * Sets one policy value, auditable via the `promotion_policy_values_change_log`
 * trigger. Server/admin-only — there is no client path to this today. `supabase`
 * must be a service-role client.
 */
export async function setPromotionPolicyValue(
  supabase: SupabaseClient,
  key: keyof PromotionPolicy,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("promotion_policy_values")
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`setPromotionPolicyValue(${key}): ${error.message}`);
}
