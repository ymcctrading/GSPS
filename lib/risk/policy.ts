/**
 * Server-only resolver for the risk domain's `policy_values` overrides
 * (domain "risk"): the `CircuitThresholds` (circuit-breaker.ts) as one flat,
 * `policy_values`-shaped record and back — the same pattern
 * lib/promotion/policy.ts established for tier promotion, generalized via
 * lib/policy/store.ts.
 *
 * The risk-band keys (`riskBandRate*`, `minTradesForRiskIncrease`,
 * `exceptionalBandMinTrades`, `absoluteTierCapPct`) were removed with the band
 * policy they configured (R-004, 2026-10-22): Gann's capital rules size and
 * refuse every order (`lib/risk/gannCapital.ts`), and the bands have no Gann
 * source. A stored row under one of those keys is no longer read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicyOverrides, setPolicyValue, type PolicyDirection } from "@/lib/policy/store";
import { DEFAULT_CIRCUIT_THRESHOLDS, type CircuitThresholds } from "@/lib/risk/circuit-breaker";

const RISK_POLICY_DOMAIN = "risk";

/** Flat, `policy_values`-shaped view of every risk-domain threshold. */
export interface RiskPolicyValues {
  warning48hLossPct: number;
  softCooldown48hLossPct: number;
  hardCooldown48hLossPct: number;
  criticalLock30dDrawdownPct: number;
  emergencyLock30dDrawdownPct: number;
  severeOverride30dDrawdownPct: number;
  hardCooldownBlockedDays: number;
  criticalLockBlockedDays: number;
  emergencyLockBlockedDays: number;
}

export const DEFAULT_RISK_POLICY_VALUES: RiskPolicyValues = {
  warning48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.warning48hLossPct,
  softCooldown48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.softCooldown48hLossPct,
  hardCooldown48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.hardCooldown48hLossPct,
  criticalLock30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.criticalLock30dDrawdownPct,
  emergencyLock30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.emergencyLock30dDrawdownPct,
  severeOverride30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.severeOverride30dDrawdownPct,
  hardCooldownBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.hardCooldownBlockedDays,
  criticalLockBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.criticalLockBlockedDays,
  emergencyLockBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.emergencyLockBlockedDays,
};

export const RISK_POLICY_KEYS = Object.keys(DEFAULT_RISK_POLICY_VALUES) as (keyof RiskPolicyValues)[];

/**
 * Which way each key tightens (Q13, owner 2026-10-16): a `policy_values` row
 * may only tighten a risk limit. Loss and drawdown triggers tighten downward;
 * the blocked days tighten upward.
 */
export const RISK_POLICY_DIRECTIONS: Record<keyof RiskPolicyValues, PolicyDirection> = {
  warning48hLossPct: "atMost",
  softCooldown48hLossPct: "atMost",
  hardCooldown48hLossPct: "atMost",
  criticalLock30dDrawdownPct: "atMost",
  emergencyLock30dDrawdownPct: "atMost",
  severeOverride30dDrawdownPct: "atMost",
  hardCooldownBlockedDays: "atLeast",
  criticalLockBlockedDays: "atLeast",
  emergencyLockBlockedDays: "atLeast",
};

export interface ResolvedRiskPolicy {
  circuit: CircuitThresholds;
}

function toCircuitThresholds(v: RiskPolicyValues): CircuitThresholds {
  return {
    warning48hLossPct: v.warning48hLossPct,
    softCooldown48hLossPct: v.softCooldown48hLossPct,
    hardCooldown48hLossPct: v.hardCooldown48hLossPct,
    criticalLock30dDrawdownPct: v.criticalLock30dDrawdownPct,
    emergencyLock30dDrawdownPct: v.emergencyLock30dDrawdownPct,
    severeOverride30dDrawdownPct: v.severeOverride30dDrawdownPct,
    hardCooldownBlockedDays: v.hardCooldownBlockedDays,
    criticalLockBlockedDays: v.criticalLockBlockedDays,
    emergencyLockBlockedDays: v.emergencyLockBlockedDays,
  };
}

/**
 * Resolves the effective risk policy: code defaults with any valid
 * `policy_values` (domain "risk") override applied on top, split back into
 * the circuit thresholds `resolveState` accepts. `supabase` should be a
 * service-role client.
 */
export async function getRiskPolicy(supabase: SupabaseClient): Promise<ResolvedRiskPolicy> {
  const values = await getPolicyOverrides(supabase, RISK_POLICY_DOMAIN, DEFAULT_RISK_POLICY_VALUES, RISK_POLICY_KEYS, RISK_POLICY_DIRECTIONS);
  return { circuit: toCircuitThresholds(values) };
}

/** Server/admin-only. Sets one risk-domain policy value, auditable via `policy_change_log`. */
export async function setRiskPolicyValue(
  supabase: SupabaseClient,
  key: keyof RiskPolicyValues,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  await setPolicyValue(supabase, RISK_POLICY_DOMAIN, key, value, updatedBy, {
    default: DEFAULT_RISK_POLICY_VALUES[key],
    direction: RISK_POLICY_DIRECTIONS[key],
  });
}
