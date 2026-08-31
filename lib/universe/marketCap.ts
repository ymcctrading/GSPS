/**
 * `market_cap_pass` — the spec's absolute-floor filter.
 *
 * "Do not use $10M; that admits unsuitable microcaps" is the spec's own
 * example of the failure mode this exists to prevent, so the floor is a hard
 * `$10B` regardless of how confident the market-cap figure feeding it is.
 * `marketCapUsd: null` (no read, or a read too stale to trust — see
 * dataQuality.ts) fails closed rather than passing an unknown-cap symbol
 * through on the assumption it is large.
 */

import { MARKET_CAP_CORE_FLOOR_USD, MARKET_CAP_FLOOR_USD } from "./config";
import type { UniverseFilterResult } from "./types";

/** `policy_values`-overridable floors — see lib/universe/policy.ts. Defaults are the same constants this file always used. */
export interface MarketCapThresholds {
  marketCapFloorUsd: number;
  marketCapCoreFloorUsd: number;
}

export const DEFAULT_MARKET_CAP_THRESHOLDS: MarketCapThresholds = {
  marketCapFloorUsd: MARKET_CAP_FLOOR_USD,
  marketCapCoreFloorUsd: MARKET_CAP_CORE_FLOOR_USD,
};

export function marketCapPass(
  marketCapUsd: number | null,
  thresholds: MarketCapThresholds = DEFAULT_MARKET_CAP_THRESHOLDS,
): UniverseFilterResult {
  if (marketCapUsd === null || !Number.isFinite(marketCapUsd)) {
    return {
      key: "market_cap_pass",
      pass: false,
      reason: "Market capitalization is unknown, and an unknown cap cannot be certified above the $10B floor.",
    };
  }
  if (marketCapUsd < thresholds.marketCapFloorUsd) {
    return {
      key: "market_cap_pass",
      pass: false,
      reason: `Market cap ${formatUsd(marketCapUsd)} is below the $10B absolute floor.`,
    };
  }
  return { key: "market_cap_pass", pass: true, reason: null };
}

/** Whether a cap clears the preferred *core* floor, for callers that want to rank rather than just gate. */
export function isCoreMarketCap(
  marketCapUsd: number | null,
  thresholds: MarketCapThresholds = DEFAULT_MARKET_CAP_THRESHOLDS,
): boolean {
  return marketCapUsd !== null && Number.isFinite(marketCapUsd) && marketCapUsd >= thresholds.marketCapCoreFloorUsd;
}

/**
 * `market_cap_pass`, sourced from a real screen rather than a numeric read.
 *
 * GSPS has no live market-cap feed wired into the scan pipeline (see
 * `lib/strat/large-cap.ts`'s identical disclosure for the same gap). What it
 * does have is `lib/scan/large-cap-universe.ts`'s committed list — a
 * `stockanalysis.com` "$10B-$200B" cap screen capture, ranks 1-500 of 893,
 * documented there as spanning roughly $22.5B-$197.9B at capture time.
 * Membership is therefore a real, sourced signal that a symbol's cap is
 * (or very recently was) above the absolute floor — not a guess and not a
 * fabricated number. Non-membership is **not** evidence of being below the
 * floor (the list's coverage stops at rank 500 of 893, and caps drift), so
 * it still fails closed via `marketCapPass(null)` rather than assuming small.
 */
export function marketCapPassFromLargeCapCoverage(inLargeCapUniverse: boolean): UniverseFilterResult {
  if (inLargeCapUniverse) {
    return { key: "market_cap_pass", pass: true, reason: null };
  }
  return marketCapPass(null);
}

function formatUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  return `$${v.toLocaleString("en-US")}`;
}
