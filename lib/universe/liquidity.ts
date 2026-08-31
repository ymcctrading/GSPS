/**
 * `liquidity_pass` — the Novice-tier average-daily-dollar-volume filter.
 *
 * Distinct from, and stricter than, `lib/scan/liquidity.ts`'s platform-wide
 * floor. That floor (price/share-volume, or crypto dollar turnover) is the
 * line under which a fill is not achievable at all and applies to every scan
 * regardless of audience. This one is the spec's Novice-specific bar — a
 * $250M average-daily-dollar-volume threshold meant to keep a beginner
 * completely out of names where friction is merely *survivable* rather than
 * negligible — and only ever gates the Novice-eligible universe, never the
 * base scanner. A symbol can clear the platform floor and still fail this
 * one; that is by design, not a bug to reconcile.
 */

import { NOVICE_LIQUIDITY_CORE_FLOOR_USD, NOVICE_LIQUIDITY_FLOOR_USD } from "./config";
import type { UniverseFilterResult } from "./types";

/** `policy_values`-overridable floors — see lib/universe/policy.ts. Defaults are the same constants this file always used. */
export interface LiquidityThresholds {
  noviceLiquidityFloorUsd: number;
  noviceLiquidityCoreFloorUsd: number;
}

export const DEFAULT_LIQUIDITY_THRESHOLDS: LiquidityThresholds = {
  noviceLiquidityFloorUsd: NOVICE_LIQUIDITY_FLOOR_USD,
  noviceLiquidityCoreFloorUsd: NOVICE_LIQUIDITY_CORE_FLOOR_USD,
};

export function liquidityPass(
  avgDailyDollarVolume: number | null,
  thresholds: LiquidityThresholds = DEFAULT_LIQUIDITY_THRESHOLDS,
): UniverseFilterResult {
  if (avgDailyDollarVolume === null || !Number.isFinite(avgDailyDollarVolume)) {
    return {
      key: "liquidity_pass",
      pass: false,
      reason: "Average daily dollar volume is unknown, and an unreadable liquidity history is not a liquid one.",
    };
  }
  if (avgDailyDollarVolume < thresholds.noviceLiquidityFloorUsd) {
    return {
      key: "liquidity_pass",
      pass: false,
      reason: `Average daily dollar volume ${formatUsd(avgDailyDollarVolume)} is below the $250M Novice liquidity floor.`,
    };
  }
  return { key: "liquidity_pass", pass: true, reason: null };
}

/** Whether a read clears the preferred *core* liquidity floor, for ranking rather than gating. */
export function isCoreLiquidity(
  avgDailyDollarVolume: number | null,
  thresholds: LiquidityThresholds = DEFAULT_LIQUIDITY_THRESHOLDS,
): boolean {
  return (
    avgDailyDollarVolume !== null &&
    Number.isFinite(avgDailyDollarVolume) &&
    avgDailyDollarVolume >= thresholds.noviceLiquidityCoreFloorUsd
  );
}

function formatUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
