/**
 * Server-only resolver for the risk domain's `policy_values` overrides
 * (domain "risk"), composing `CircuitThresholds` (circuit-breaker.ts) and
 * `RiskBandThresholds` (dynamic-risk.ts) into one flat, `policy_values`-shaped
 * record and back — the same pattern lib/promotion/policy.ts established for
 * tier promotion, generalized via lib/policy/store.ts.
 *
 * `RISK_BAND_RATE_PCT` is a nested record (one rate per band), not a flat
 * number, so each band gets its own flattened key
 * (`riskBandRateBase`, `riskBandRateATier`, ...) here — `policy_values` only
 * stores flat numeric keys per domain.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicyOverrides, setPolicyValue, type PolicyBounds } from "@/lib/policy/store";
import { DEFAULT_CIRCUIT_THRESHOLDS, type CircuitThresholds } from "@/lib/risk/circuit-breaker";
import { DEFAULT_RISK_BAND_THRESHOLDS, type RiskBandThresholds } from "@/lib/risk/dynamic-risk";

const RISK_POLICY_DOMAIN = "risk";

/** Flat, `policy_values`-shaped view of every risk-domain threshold. */
export interface RiskPolicyValues {
  maxNewPositionsPerDay: number;
  warning48hLossPct: number;
  softCooldown48hLossPct: number;
  hardCooldown48hLossPct: number;
  criticalLock30dDrawdownPct: number;
  emergencyLock30dDrawdownPct: number;
  severeOverride30dDrawdownPct: number;
  hardCooldownBlockedDays: number;
  criticalLockBlockedDays: number;
  emergencyLockBlockedDays: number;
  minTradesForRiskIncrease: number;
  exceptionalBandMinTrades: number;
  absoluteTierCapPct: number;
  riskBandRateBase: number;
  riskBandRateATier: number;
  riskBandRateAPlus: number;
  riskBandRateExceptionalAPlus: number;
}

export const DEFAULT_RISK_POLICY_VALUES: RiskPolicyValues = {
  maxNewPositionsPerDay: DEFAULT_CIRCUIT_THRESHOLDS.maxNewPositionsPerDay,
  warning48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.warning48hLossPct,
  softCooldown48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.softCooldown48hLossPct,
  hardCooldown48hLossPct: DEFAULT_CIRCUIT_THRESHOLDS.hardCooldown48hLossPct,
  criticalLock30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.criticalLock30dDrawdownPct,
  emergencyLock30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.emergencyLock30dDrawdownPct,
  severeOverride30dDrawdownPct: DEFAULT_CIRCUIT_THRESHOLDS.severeOverride30dDrawdownPct,
  hardCooldownBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.hardCooldownBlockedDays,
  criticalLockBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.criticalLockBlockedDays,
  emergencyLockBlockedDays: DEFAULT_CIRCUIT_THRESHOLDS.emergencyLockBlockedDays,
  minTradesForRiskIncrease: DEFAULT_RISK_BAND_THRESHOLDS.minTradesForRiskIncrease,
  exceptionalBandMinTrades: DEFAULT_RISK_BAND_THRESHOLDS.exceptionalBandMinTrades,
  absoluteTierCapPct: DEFAULT_RISK_BAND_THRESHOLDS.absoluteTierCapPct,
  riskBandRateBase: DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.base,
  riskBandRateATier: DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.a_tier,
  riskBandRateAPlus: DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.a_plus,
  riskBandRateExceptionalAPlus: DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.exceptional_a_plus,
};

export const RISK_POLICY_KEYS = Object.keys(DEFAULT_RISK_POLICY_VALUES) as (keyof RiskPolicyValues)[];

/**
 * Sanity ranges for stored overrides (audit F4.3, 2026-09-26). Wide on
 * purpose: they catch typos, not tuning. Percent keys are in percent (2 = 2%).
 */
export const RISK_POLICY_BOUNDS: PolicyBounds<RiskPolicyValues> = {
  maxNewPositionsPerDay: { min: 0, max: 20, integer: true },
  warning48hLossPct: { min: 0.5, max: 10 },
  softCooldown48hLossPct: { min: 0.5, max: 15 },
  hardCooldown48hLossPct: { min: 1, max: 20 },
  criticalLock30dDrawdownPct: { min: 2, max: 30 },
  emergencyLock30dDrawdownPct: { min: 3, max: 40 },
  severeOverride30dDrawdownPct: { min: 5, max: 50 },
  hardCooldownBlockedDays: { min: 0, max: 10, integer: true },
  criticalLockBlockedDays: { min: 1, max: 30, integer: true },
  emergencyLockBlockedDays: { min: 1, max: 60, integer: true },
  minTradesForRiskIncrease: { min: 5, max: 200, integer: true },
  exceptionalBandMinTrades: { min: 10, max: 500, integer: true },
  absoluteTierCapPct: { min: 0.1, max: 3 },
  riskBandRateBase: { min: 0.1, max: 3 },
  riskBandRateATier: { min: 0.1, max: 3 },
  riskBandRateAPlus: { min: 0.1, max: 3 },
  riskBandRateExceptionalAPlus: { min: 0.1, max: 3 },
};

export interface ResolvedRiskPolicy {
  circuit: CircuitThresholds;
  band: RiskBandThresholds;
}

function toCircuitThresholds(v: RiskPolicyValues): CircuitThresholds {
  return {
    maxNewPositionsPerDay: v.maxNewPositionsPerDay,
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

function toBandThresholds(v: RiskPolicyValues): RiskBandThresholds {
  return {
    minTradesForRiskIncrease: v.minTradesForRiskIncrease,
    exceptionalBandMinTrades: v.exceptionalBandMinTrades,
    absoluteTierCapPct: v.absoluteTierCapPct,
    riskBandRatePct: {
      base: v.riskBandRateBase,
      a_tier: v.riskBandRateATier,
      a_plus: v.riskBandRateAPlus,
      exceptional_a_plus: v.riskBandRateExceptionalAPlus,
    },
  };
}

/**
 * Resolves the effective risk policy: code defaults with any valid
 * `policy_values` (domain "risk") override applied on top, split back into
 * the two shapes `resolveState`/`resolveRiskBand`/`computePermittedRisk`
 * accept. `supabase` should be a service-role client.
 */
export async function getRiskPolicy(supabase: SupabaseClient): Promise<ResolvedRiskPolicy> {
  const values = await getPolicyOverrides(
    supabase,
    RISK_POLICY_DOMAIN,
    DEFAULT_RISK_POLICY_VALUES,
    RISK_POLICY_KEYS,
    RISK_POLICY_BOUNDS,
  );
  return { circuit: toCircuitThresholds(values), band: toBandThresholds(values) };
}

/** Server/admin-only. Sets one risk-domain policy value, auditable via `policy_change_log`. */
export async function setRiskPolicyValue(
  supabase: SupabaseClient,
  key: keyof RiskPolicyValues,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  await setPolicyValue(supabase, RISK_POLICY_DOMAIN, key, value, updatedBy);
}
