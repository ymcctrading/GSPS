/**
 * An expired plan: the stock stays tracked, the setup does not.
 * -----------------------------------------------------------------------------
 * Owner, 2026-10-28 (approved "Go" on the plan in the "Expire outdated setups"
 * thread): "prices/setups are still being recommended that seem to be
 * outdated ... entry is 3-33% away from current price, and price is already
 * headed towards, or superseded tp1. I need to continue to track those
 * equities but I believe that the setups are expired." The scan of 2026-10-28
 * 00:35 UTC had WAT's buy at 395.23 with TP1 418.92 and MTP 447 at a price of
 * 468.39, and PINS's sell at 25.72 at a price of 20.56, past its MTP.
 *
 * Two tests, each Gann's own, decide it. Either one expires the plan:
 *
 * 1. **The first target is passed** (`target_passed`). A level is support
 *    below price and resistance above it (W006 pp.19-24); "old tops become
 *    bottoms" (*Commodities*, W001). TP1 is the next level past the entry, so
 *    once price stands beyond it, TP1 is the first level a reaction meets, and
 *    Gann's buy after a crossing is the reaction to the level just crossed
 *    (W006 pp.20, 46-47), not to one further back. The plan's entry is
 *    superseded; the next scan prices the new buying point from the new
 *    structure ("replaced is a new trade with a new stop from the new swing
 *    structure, never the old levels resumed", AGENTS.md F3.7). Read at the
 *    scan's price, so it needs no stored state and a later scan reads it again.
 * 2. **The entry is out of a reaction's reach** (`beyond_reaction`). In a
 *    campaign with the plan's trend, filling a buy below price takes a
 *    reaction from the campaign's latest top down to the entry. When that
 *    reaction would exceed the campaign's greatest reaction by one point or
 *    more, Gann reads it as the main trend changed (Master Course Ch. 8, PDF
 *    249, "by 1+ point"; `campaignLedger.ts`, C-TREND-06). A with-trend buy
 *    that can only fill on a change of trend has lost its premise, so it is
 *    expired. Mirrored for a sell above price in a bear campaign. Read only
 *    for the reaction buy after a crossing (`entryKind` "crossing"), the buy
 *    Gann places "on the reaction" to the level just crossed. Not for a buy
 *    at an old bottom (`oldLevel`): Gann's first buying point is the double or
 *    triple bottom (W006 pp.11, 20, 46), reached only by a reaction back to
 *    the last bottom, so a full retracement there is the test he buys, not a
 *    lost premise. Not read either when the plan runs against the campaign's
 *    trend, or no reaction of the campaign has completed yet (there is
 *    nothing to measure against).
 *
 * No percent or day count: Gann gives neither for this, and the swings of the
 * stock itself set the distance. The owner's "within a day's range" stays the
 * line between a plan to act on now and a resting order (`lib/setups/resting.ts`,
 * `applyReadyNowHold`); this module decides when a plan is no longer a plan.
 *
 * Applied by `applyPlanExpiredHold` (`lib/scoring/score.ts`): the verdict is
 * Reject, the scan returns no levels (`ScanResult.planExpired` keeps what the
 * plan was), so no list, chart, ticket, Guided Mode, automation or intraday
 * timing offers it anew, and a tracked symbol's monitor reads "No setup now"
 * until a new plan arms it again. A `trade_plans` row still awaiting
 * confirmation is not armed once price stands past its TP1
 * (`lib/lifecycle/armFromBars.ts`); a plan already armed, or its resting
 * order, keeps to its own one-session window and is not withdrawn here. The
 * replay does not enter such a plan, re-reading it on each closed intraday
 * candle as the live scan re-reads it on each scan (`lib/backtest/replay.ts`).
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann: as above, Tier A throughout.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. A plan is a cause staked on one level; once
 *    price has made the effect without it (the target reached) or can reach
 *    the level only by undoing its cause (an over-balance), it is spent.
 *    Rhythm describes the reaction it waits for, not what this decides;
 *    Polarity is only the mirror for a sell.
 * Law of Creation: plan ⊗ price. Each alone is a mixture; their interaction
 * creates the third, "spent or standing", which re-enters as the next scan's
 * search for a new buying point.
 */

import type { Bar } from "@/lib/types";
import type { CampaignLedger } from "@/lib/gann/campaignLedger";
import { gannPoint } from "@/lib/gann/pointScale";
import { priceUsd } from "@/lib/strat/priceText";

export type PlanExpiredReason = "target_passed" | "beyond_reaction";

export interface PlanExpiryInput {
  side: "buy" | "sell";
  price: number | null | undefined;
  levels: { entry: number; takeProfit1: number; masterProfit?: number | null; entryKind?: string | null } | null | undefined;
  /** The campaign ledger read from `bars` (`buildCampaignLedger`). */
  ledger?: CampaignLedger | null;
  /** The daily bars the ledger was built from, so its indexes read the same bars. */
  bars?: Bar[] | null;
}

export interface PlanExpiry {
  reason: PlanExpiredReason;
  /** What the plan was, for the reader. */
  entry: number;
  takeProfit1: number;
  /** `beyond_reaction` only: the reaction the fill needs, and the campaign's greatest. */
  reactionNeeded?: number;
  greatestReaction?: number;
  /** Plain words, naming no method. */
  note: string;
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/**
 * The campaign's latest extreme with its trend (the highest high since its
 * last completed reaction, the lowest low in a bear campaign), read on the
 * ledger's own bars. Null when the ledger holds no swing to start from.
 */
export function campaignExtreme(ledger: CampaignLedger, bars: Bar[]): number | null {
  const bull = ledger.trend === "bullish";
  const counter = bull ? "down" : "up";
  const legs = ledger.legs;
  if (legs.length === 0) return null;
  let from = legs[0].fromIndex;
  for (const l of legs) if (l.direction === counter) from = l.toIndex;
  if (!(from >= 0) || from >= bars.length) return null;
  let extreme = bull ? -Infinity : Infinity;
  for (let i = from; i < bars.length; i++) {
    extreme = bull ? Math.max(extreme, bars[i].h) : Math.min(extreme, bars[i].l);
  }
  return Number.isFinite(extreme) ? extreme : null;
}

/** Whether the plan has expired, and why; null while it stands (or nothing can be known). */
export function readPlanExpiry(input: PlanExpiryInput): PlanExpiry | null {
  const { side, price, levels } = input;
  if (!levels || !finite(price) || !(price > 0) || !finite(levels.entry) || !finite(levels.takeProfit1)) return null;
  const { entry, takeProfit1 } = levels;
  const buy = side === "buy";

  // 1. Price stands at or past the first target.
  if (buy ? price >= takeProfit1 : price <= takeProfit1) {
    return {
      reason: "target_passed",
      entry,
      takeProfit1,
      note: `Setup expired: price (${priceUsd(price)}) has already ${buy ? "reached" : "fallen to"} its first target (${priceUsd(takeProfit1)}) without the ${buy ? "buy" : "sell"} at ${priceUsd(entry)} filling. The stock stays on your watch until a new plan forms.`,
    };
  }

  // 2. The fill needs a reaction bigger than the campaign's greatest by a point.
  const { ledger, bars } = input;
  const reactionSide = buy ? entry < price : entry > price;
  if (levels.entryKind !== "crossing" || !reactionSide || !ledger || !bars || bars.length === 0) return null;
  if (ledger.trend !== (buy ? "bullish" : "bearish")) return null;
  const greatest = ledger.greatestCounterMove?.points;
  if (!finite(greatest) || !(greatest > 0)) return null;
  const extreme = campaignExtreme(ledger, bars);
  if (!finite(extreme)) return null;
  const needed = buy ? extreme - entry : entry - extreme;
  if (!(needed >= greatest + gannPoint(extreme))) return null;
  return {
    reason: "beyond_reaction",
    entry,
    takeProfit1,
    reactionNeeded: needed,
    greatestReaction: greatest,
    note: `Setup expired: the ${buy ? "buy" : "sell"} at ${priceUsd(entry)} sits too far ${buy ? "below the latest high" : "above the latest low"} (${priceUsd(extreme)}) for a normal ${buy ? "pullback" : "rally"} to reach. The stock stays on your watch until a new plan forms.`,
  };
}
