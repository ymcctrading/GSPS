/**
 * "Today's plan" on the Novice dashboard: the one setup a newcomer is pointed
 * at first, so it has to be one the scan actually qualified.
 *
 * Until 2026-10-16 it was the highest *score* across both lists, Reject rows
 * included. A Reject keeps its score when a hold demotes it (the stop-breach
 * hold says so: "the analysis behind it is not what failed"), so a retired
 * plan could outrank every live one. NEE was shown as Today's plan while its
 * own page said the plan was retired.
 *
 * The filter follows the scorecard's own verdict rather than re-deriving one:
 * only Execute or Watch qualifies, Execute ahead of Watch, then by score. No
 * qualifying row means no plan, and the card says so.
 *
 * Three-question basis: 1. No new Gann rule; the verdict and its holds
 * (breakaway, stop breach) are Gann's and are read, not re-weighed. 2. No
 * periodicity claim. 3. Cause and Effect: the card names the setup the verdict
 * caused, not the one whose score happened to be highest.
 *
 * A resting order (an Execute plan whose entry is more than a day's range from
 * price, owner 2026-10-21, `lib/setups/resting.ts`) is not today's trade, so it
 * ranks behind every Execute plan price is near. Since 2026-10-28 it is its own
 * tier (`setupTier`): behind Execute and ahead of Watch, since it has every
 * condition and waits only for price to come back to its level.
 */

import { setupTier, type RestingRowFields } from "@/lib/setups/resting";

const STATE_RANK: Record<string, number> = { Execute: 0, Watch: 1 };
const TIER_RANK: Record<string, number> = { Execute: 0, Resting: 1, Watch: 2 };

type RankableRow = { outputState: string; score: number } & Partial<Omit<RestingRowFields, "outputState">>;

function rankOf(r: RankableRow): number {
  const tier = setupTier({
    outputState: r.outputState,
    score: r.score,
    resting: r.resting,
    side: r.direction === "bearish" ? "sell" : "buy",
    price: r.currentPrice,
    entry: r.entry,
    dayRange: r.dayRange,
  });
  return TIER_RANK[tier] ?? TIER_RANK.Watch;
}

export function isQualifiedSetup(r: { outputState: string }): boolean {
  return r.outputState in STATE_RANK;
}

export function bestQualifiedSetup<T extends RankableRow>(rows: T[]): T | null {
  return rows.filter(isQualifiedSetup).sort((a, b) => rankOf(a) - rankOf(b) || b.score - a.score)[0] ?? null;
}
