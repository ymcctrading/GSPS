/**
 * Phase 3C: server-side dashboard result-visibility cap.
 *
 * Applies docs/GSPS_TIER_ENTITLEMENT_SPEC.md's "Setup-result visibility" rule to
 * a scanned batch: rank qualifying setups, cap the count at the caller's
 * `maxDashboardSetupsPerScan`, and — for Novice specifically — prefer up to
 * 3 Buy and 3 Sell before backfilling from the other side. Never fabricates
 * a result: a side with nothing qualified stays empty rather than being
 * padded.
 */

export type ResultSide = "buy" | "sell";

export type RankedSetup<T> = {
  side: ResultSide;
  /** Higher ranks first. Ties keep scan order (stable sort). */
  rank: number;
  value: T;
};

export type ResultSelectionMetadata = {
  qualifyingSetupCount: number;
  returnedSetupCount: number;
  maxSetupsPerScan: number;
  resultLimitApplied: boolean;
  directionalAllocation: { buy: number; sell: number };
  upgradeAvailable: boolean;
};

export type ResultSelection<T> = {
  visible: RankedSetup<T>[];
  metadata: ResultSelectionMetadata;
};

/**
 * `isWallStreetOrAbove` decides `upgradeAvailable`: the top tier truncating
 * (because the scanner itself found more than the 30-setup scanner maximum)
 * is not something an upgrade would fix, so it's never offered one.
 */
export function selectVisibleResults<T>(
  qualifying: RankedSetup<T>[],
  opts: { maxSetupsPerScan: number; noviceDirectionalBackfill: boolean; isTopTier: boolean },
): ResultSelection<T> {
  const { maxSetupsPerScan, noviceDirectionalBackfill, isTopTier } = opts;

  // Stable rank-descending order — Array.prototype.sort is stable per spec,
  // so equal ranks keep the caller's original (scan) order.
  const ranked = [...qualifying].sort((a, b) => b.rank - a.rank);

  const visible = noviceDirectionalBackfill
    ? selectWithDirectionalBackfill(ranked, maxSetupsPerScan)
    : ranked.slice(0, maxSetupsPerScan);

  const buy = visible.filter((s) => s.side === "buy").length;
  const sell = visible.filter((s) => s.side === "sell").length;

  return {
    visible,
    metadata: {
      qualifyingSetupCount: ranked.length,
      returnedSetupCount: visible.length,
      maxSetupsPerScan,
      resultLimitApplied: ranked.length > visible.length,
      directionalAllocation: { buy, sell },
      upgradeAvailable: ranked.length > visible.length && !isTopTier,
    },
  };
}

/**
 * Novice's rule: up to 3 Buy and 3 Sell by rank, then fill remaining slots
 * (out of `maxSetupsPerScan`, not necessarily 6 — kept general in case a
 * future tier reuses this shape) from the highest-ranked remaining
 * candidates in either direction. Never pads past what qualified.
 */
function selectWithDirectionalBackfill<T>(
  ranked: RankedSetup<T>[],
  maxSetupsPerScan: number,
): RankedSetup<T>[] {
  const perSide = Math.floor(maxSetupsPerScan / 2);

  const buys = ranked.filter((s) => s.side === "buy");
  const sells = ranked.filter((s) => s.side === "sell");

  const takenBuys = buys.slice(0, perSide);
  const takenSells = sells.slice(0, perSide);
  const taken = new Set([...takenBuys, ...takenSells]);

  const remaining = ranked.filter((s) => !taken.has(s));
  const backfillCount = Math.max(0, maxSetupsPerScan - taken.size);
  const backfill = remaining.slice(0, backfillCount);

  // Re-sort the combined selection back to rank order for display —
  // the directional split above doesn't preserve overall rank order.
  return [...takenBuys, ...takenSells, ...backfill].sort((a, b) => b.rank - a.rank);
}
