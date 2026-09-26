/**
 * Generic server-only resolver/writer for `policy_values`, the domain-scoped
 * versioned-config table backing every policy domain's own `getXPolicy()`
 * (see lib/risk/policy.ts for the first caller). Mirrors
 * lib/promotion/policy.ts's `getPromotionPolicy`/`setPromotionPolicyValue`,
 * generalized across domains instead of one table per domain.
 *
 * Fail-closed posture: any read error, missing row, or malformed value falls
 * back to the caller-supplied code default rather than throwing — these are
 * ceilings on risk/eligibility, so degrading to the documented-safe default
 * is the correct failure mode, never a wider one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface PolicyValueRow {
  key: string;
  value: number;
}

/**
 * A sanity range for one policy key. Not the policy itself — the widest value
 * that could plausibly be intended, so a typo (a percent stored as a
 * fraction, a dollar figure with three extra zeros, a negative count) is
 * rejected instead of becoming the platform's live risk ceiling.
 */
export interface PolicyBound {
  min: number;
  max: number;
  /** Counts and day totals must be whole numbers. */
  integer?: boolean;
}

export type PolicyBounds<T> = Partial<Record<keyof T, PolicyBound>>;

/** Why a stored override was rejected, or null when it is within bounds. */
export function policyBoundViolation(value: number, bound: PolicyBound | undefined): string | null {
  if (!bound) return null;
  if (bound.integer && !Number.isInteger(value)) return `must be a whole number`;
  if (value < bound.min || value > bound.max) return `outside [${bound.min}, ${bound.max}]`;
  return null;
}

/**
 * Resolves the effective policy for one domain: `defaults` with any valid
 * `policy_values` row (restricted to `keys`) applied on top. Non-numeric or
 * unknown-key rows are ignored. `supabase` should be a service-role client —
 * the table has no client select policy.
 *
 * `bounds` (added 2026-09-26, alignment audit F4.3, pre-approved): a row
 * outside its key's sanity range is rejected and logged, and the code default
 * stands. Before this any finite number was accepted, so one mistyped row
 * could set a live risk ceiling to anything. The table had no rows when this
 * landed, so it changed nothing live.
 */
export async function getPolicyOverrides<T extends object>(
  supabase: SupabaseClient,
  domain: string,
  defaults: T,
  keys: readonly (keyof T)[] = Object.keys(defaults) as (keyof T)[],
  bounds: PolicyBounds<T> = {},
): Promise<T> {
  const { data, error } = await supabase
    .from("policy_values")
    .select("key, value")
    .eq("domain", domain)
    .in("key", (keys as unknown[]).map(String));

  if (error || !data) {
    if (error) console.error(`policy(${domain}): override read failed, using defaults — ${error.message}`);
    return { ...defaults };
  }

  const resolved = { ...defaults } as Record<string, number>;
  for (const row of data as PolicyValueRow[]) {
    const key = row.key;
    if (!(keys as unknown[]).map(String).includes(key)) continue;
    const value = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(value)) continue;
    const violation = policyBoundViolation(value, (bounds as Record<string, PolicyBound | undefined>)[key]);
    if (violation) {
      console.error(`policy(${domain}): rejected override ${key}=${value} (${violation}); using the default`);
      continue;
    }
    resolved[key] = value;
  }
  return resolved as T;
}

/**
 * Sets one policy value for a domain, auditable via the
 * `policy_values_change_log` trigger. Server/admin-only — there is no client
 * path to this today. `supabase` must be a service-role client.
 */
export async function setPolicyValue(
  supabase: SupabaseClient,
  domain: string,
  key: string,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("policy_values")
    .upsert({ domain, key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "domain,key" });
  if (error) throw new Error(`setPolicyValue(${domain}.${key}): ${error.message}`);
}
