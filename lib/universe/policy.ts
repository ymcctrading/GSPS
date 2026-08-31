/**
 * Server-only resolver for the universe domain's `policy_values` overrides
 * (domain "universe"), composing every filter module's own `*Thresholds`
 * shape (marketCap.ts, liquidity.ts, priceAccessibility.ts, spread.ts,
 * volatility.ts, dataQuality.ts, smallAccount.ts) into one flat,
 * `policy_values`-shaped record and back — the same pattern
 * lib/risk/policy.ts established for the risk domain, generalized via
 * lib/policy/store.ts.
 *
 * Not yet wired into a live call site: `lib/universe/scanGates.ts`'s
 * `buildScanNoviceEligibility` is called once per symbol from
 * `lib/scanTicker.ts`'s hot scan path, which has no Supabase client in scope
 * today and runs per-symbol across a whole scan batch — resolving
 * `policy_values` there needs a resolve-once-per-batch design, not a
 * per-symbol fetch. This resolver is ready for whichever server route wires
 * it in (see docs/CLAUDE_CODE_ROADMAP_TRACKER.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicyOverrides, setPolicyValue } from "@/lib/policy/store";
import { DEFAULT_MARKET_CAP_THRESHOLDS, type MarketCapThresholds } from "@/lib/universe/marketCap";
import { DEFAULT_LIQUIDITY_THRESHOLDS, type LiquidityThresholds } from "@/lib/universe/liquidity";
import { DEFAULT_PRICE_BAND_THRESHOLDS, type PriceBandThresholds } from "@/lib/universe/priceAccessibility";
import { DEFAULT_SPREAD_THRESHOLDS, type SpreadThresholds } from "@/lib/universe/spread";
import { DEFAULT_VOLATILITY_THRESHOLDS, type VolatilityThresholds } from "@/lib/universe/volatility";
import { DEFAULT_DATA_QUALITY_THRESHOLDS, type DataQualityThresholds } from "@/lib/universe/dataQuality";
import { DEFAULT_SMALL_ACCOUNT_THRESHOLDS, type SmallAccountThresholds } from "@/lib/universe/smallAccount";
import type { UniverseThresholds } from "@/lib/universe/eligibility";

const UNIVERSE_POLICY_DOMAIN = "universe";

/** Flat, `policy_values`-shaped view of every universe-domain threshold. */
export interface UniversePolicyValues {
  marketCapFloorUsd: number;
  marketCapCoreFloorUsd: number;
  noviceLiquidityFloorUsd: number;
  noviceLiquidityCoreFloorUsd: number;
  priceBandMinUsd: number;
  priceBandMaxUsd: number;
  maxSpreadPctOfPrice: number;
  maxSpreadFractionOfStop: number;
  minAtrPctOfPrice: number;
  maxAtrPctOfPrice: number;
  maxQuoteStalenessSeconds: number;
  maxFundamentalsStalenessDays: number;
  minWholeUnitsForStagedExit: number;
}

export const DEFAULT_UNIVERSE_POLICY_VALUES: UniversePolicyValues = {
  marketCapFloorUsd: DEFAULT_MARKET_CAP_THRESHOLDS.marketCapFloorUsd,
  marketCapCoreFloorUsd: DEFAULT_MARKET_CAP_THRESHOLDS.marketCapCoreFloorUsd,
  noviceLiquidityFloorUsd: DEFAULT_LIQUIDITY_THRESHOLDS.noviceLiquidityFloorUsd,
  noviceLiquidityCoreFloorUsd: DEFAULT_LIQUIDITY_THRESHOLDS.noviceLiquidityCoreFloorUsd,
  priceBandMinUsd: DEFAULT_PRICE_BAND_THRESHOLDS.priceBandMinUsd,
  priceBandMaxUsd: DEFAULT_PRICE_BAND_THRESHOLDS.priceBandMaxUsd,
  maxSpreadPctOfPrice: DEFAULT_SPREAD_THRESHOLDS.maxSpreadPctOfPrice,
  maxSpreadFractionOfStop: DEFAULT_SPREAD_THRESHOLDS.maxSpreadFractionOfStop,
  minAtrPctOfPrice: DEFAULT_VOLATILITY_THRESHOLDS.minAtrPctOfPrice,
  maxAtrPctOfPrice: DEFAULT_VOLATILITY_THRESHOLDS.maxAtrPctOfPrice,
  maxQuoteStalenessSeconds: DEFAULT_DATA_QUALITY_THRESHOLDS.maxQuoteStalenessSeconds,
  maxFundamentalsStalenessDays: DEFAULT_DATA_QUALITY_THRESHOLDS.maxFundamentalsStalenessDays,
  minWholeUnitsForStagedExit: DEFAULT_SMALL_ACCOUNT_THRESHOLDS.minWholeUnitsForStagedExit,
};

export const UNIVERSE_POLICY_KEYS = Object.keys(DEFAULT_UNIVERSE_POLICY_VALUES) as (keyof UniversePolicyValues)[];

export interface ResolvedUniversePolicy {
  universe: UniverseThresholds;
  smallAccount: SmallAccountThresholds;
}

function toUniverseThresholds(v: UniversePolicyValues): UniverseThresholds {
  return {
    marketCap: { marketCapFloorUsd: v.marketCapFloorUsd, marketCapCoreFloorUsd: v.marketCapCoreFloorUsd } satisfies MarketCapThresholds,
    liquidity: {
      noviceLiquidityFloorUsd: v.noviceLiquidityFloorUsd,
      noviceLiquidityCoreFloorUsd: v.noviceLiquidityCoreFloorUsd,
    } satisfies LiquidityThresholds,
    priceBand: { priceBandMinUsd: v.priceBandMinUsd, priceBandMaxUsd: v.priceBandMaxUsd } satisfies PriceBandThresholds,
    spread: {
      maxSpreadPctOfPrice: v.maxSpreadPctOfPrice,
      maxSpreadFractionOfStop: v.maxSpreadFractionOfStop,
    } satisfies SpreadThresholds,
    volatility: { minAtrPctOfPrice: v.minAtrPctOfPrice, maxAtrPctOfPrice: v.maxAtrPctOfPrice } satisfies VolatilityThresholds,
    dataQuality: {
      maxQuoteStalenessSeconds: v.maxQuoteStalenessSeconds,
      maxFundamentalsStalenessDays: v.maxFundamentalsStalenessDays,
    } satisfies DataQualityThresholds,
  };
}

/**
 * Resolves the effective universe policy: code defaults with any valid
 * `policy_values` (domain "universe") override applied on top, split back
 * into the shapes `assessNoviceEligibility`/`buildScanNoviceEligibility`/
 * `exitMechanics` accept. `supabase` should be a service-role client.
 */
export async function getUniversePolicy(supabase: SupabaseClient): Promise<ResolvedUniversePolicy> {
  const values = await getPolicyOverrides(
    supabase,
    UNIVERSE_POLICY_DOMAIN,
    DEFAULT_UNIVERSE_POLICY_VALUES,
    UNIVERSE_POLICY_KEYS,
  );
  return {
    universe: toUniverseThresholds(values),
    smallAccount: { minWholeUnitsForStagedExit: values.minWholeUnitsForStagedExit },
  };
}

/** Server/admin-only. Sets one universe-domain policy value, auditable via `policy_change_log`. */
export async function setUniversePolicyValue(
  supabase: SupabaseClient,
  key: keyof UniversePolicyValues,
  value: number,
  updatedBy: string | null,
): Promise<void> {
  await setPolicyValue(supabase, UNIVERSE_POLICY_DOMAIN, key, value, updatedBy);
}
