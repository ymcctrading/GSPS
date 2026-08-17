/**
 * Guided Decision Mode — how many shares, and what that actually risks.
 *
 * Pressing Buy must never mean "buy an unset quantity". The share count is
 * derived from the one number the user is entitled to have decided for them
 * conservatively — the share of their equity they are willing to lose on this
 * trade — divided by the distance from entry to stop. Everything the card says
 * in dollars is computed from the resulting quantity against the real
 * entry/stop/target prices, never from an advertised R-multiple.
 *
 * Four ceilings apply, in this order, and the smallest wins:
 *
 *   1. Risk cap        — riskPct of equity ÷ (entry − stop).
 *   2. Portfolio cap   — what is left under the deployed-capital ceiling.
 *   3. Buying power    — a simulated cash account cannot buy what it cannot pay for.
 *   4. Tradeability    — below MIN_GUIDED_QTY the protocol's staged exit collapses
 *                        into a single all-or-nothing target, which is not the
 *                        trade the card describes. Below it, there is no trade.
 */

import { MIN_GUIDED_QTY } from "@/lib/guided/config";
import { planProtocolExit, SCALE_OUT_PCT } from "@/lib/trade/protocol-exit";

export interface SizingInputs {
  /** Current paper account equity — cash plus the market value of open positions. */
  equity: number;
  /** Cash actually available to buy with. */
  buyingPower: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  masterProfit: number;
  /** Percent of equity to risk on this trade. */
  riskPct: number;
  /** Ceiling on total guided capital deployed at once, as a percent of equity. */
  maxDeployedPct: number;
  /** Capital already tied up in open guided positions, in dollars. */
  deployedUsd: number;
  /** Whole units only (equities). Crypto can be fractional at the broker, but the
   *  simulator's ledger and the protocol's tranche split are both whole-unit. */
  wholeUnitsOnly?: boolean;
}

export interface SizedTrade {
  qty: number;
  /** Cash the entry consumes. */
  notionalUsd: number;
  /** Dollars lost if the stop is hit on the whole position. */
  riskUsd: number;
  /**
   * Dollars made if the trade runs to the master target, following the
   * protocol's staged exit — 60% out at TP1, then the rest at the master. Not
   * `qty × (master − entry)`, which nothing about this trade would produce.
   */
  rewardUsd: number;
  /** Dollars made if the trade reaches TP1 and the remainder is closed at entry. */
  rewardAtTp1Usd: number;
  /** Realised reward-to-risk of the staged plan, for the "why" panel. */
  rewardToRisk: number;
  /** Which ceiling decided the size — named so the card can say so. */
  boundBy: "risk" | "portfolio" | "buying_power";
  /** Null when the trade is placeable; otherwise why it is not. */
  blockedReason: string | null;
}

export function sizeGuidedTrade(input: SizingInputs): SizedTrade {
  const {
    equity, buyingPower, entry, stopLoss, takeProfit1, masterProfit,
    riskPct, maxDeployedPct, deployedUsd, wholeUnitsOnly = true,
  } = input;

  const riskPerShare = entry - stopLoss;
  const empty = (reason: string): SizedTrade => ({
    qty: 0,
    notionalUsd: 0,
    riskUsd: 0,
    rewardUsd: 0,
    rewardAtTp1Usd: 0,
    rewardToRisk: 0,
    boundBy: "risk",
    blockedReason: reason,
  });

  if (!(riskPerShare > 0) || !(entry > 0)) {
    return empty("This setup has no usable distance between its entry and its stop.");
  }
  if (!(equity > 0)) {
    return empty("Your paper account has no equity to size a trade against.");
  }

  const riskBudget = equity * (riskPct / 100);
  const byRisk = riskBudget / riskPerShare;

  const deployableUsd = Math.max(equity * (maxDeployedPct / 100) - deployedUsd, 0);
  const byPortfolio = deployableUsd / entry;

  const byCash = Math.max(buyingPower, 0) / entry;

  const raw = Math.min(byRisk, byPortfolio, byCash);
  const qty = wholeUnitsOnly ? Math.floor(raw) : Math.floor(raw * 1e6) / 1e6;

  // Which ceiling actually bit. Compared on the pre-rounding numbers, because
  // after flooring several of them can tie at the same integer.
  const boundBy: SizedTrade["boundBy"] =
    byPortfolio <= byRisk && byPortfolio <= byCash
      ? "portfolio"
      : byCash <= byRisk
        ? "buying_power"
        : "risk";

  if (qty < MIN_GUIDED_QTY) {
    return {
      ...empty(blockedCopy(boundBy, qty, deployedUsd > 0)),
      boundBy,
    };
  }

  // The reward figure has to describe the exit the order will actually place.
  // `planProtocolExit` owns that split, so it is asked rather than approximated
  // — a 60% scale-out on 7 shares is 4 shares, not 4.2, and the difference
  // shows up in the dollar figure the user is shown.
  const plan = planProtocolExit(qty, { stopLoss, takeProfit1, masterProfit });
  const tp1Gain = (takeProfit1 - entry) * plan.scaleOutQty;
  const masterGain = (masterProfit - entry) * (plan.masterQty + plan.runnerQty);

  const riskUsd = riskPerShare * qty;
  const rewardUsd = tp1Gain + masterGain;

  return {
    qty,
    notionalUsd: entry * qty,
    riskUsd,
    // If TP1 fills and the stop has ratcheted to break-even, the remainder
    // leaves for nothing — the honest floor on a trade that works partway.
    rewardAtTp1Usd: tp1Gain,
    rewardUsd,
    rewardToRisk: riskUsd > 0 ? rewardUsd / riskUsd : 0,
    boundBy,
    blockedReason: null,
  };
}

function blockedCopy(boundBy: SizedTrade["boundBy"], qty: number, alreadyDeployed: boolean): string {
  if (qty <= 0) {
    if (boundBy === "portfolio") {
      // The same ceiling, two different situations: room already spent, versus
      // an account so small that one share of this symbol would breach the cap
      // on its own. Saying "close a guided position" to someone holding none
      // would send them looking for something that isn't there.
      return alreadyDeployed
        ? "Guided Mode has already deployed as much of your paper equity as its cap allows. Close a guided position to free it up."
        : "A single share of this symbol would be more of your paper equity than Guided Mode is allowed to commit at once.";
    }
    return boundBy === "buying_power"
      ? "There isn't enough cash in the paper account to open a position here."
      : "Your per-trade risk cap doesn't stretch to a single share of this symbol.";
  }
  return `A trade sized to your risk cap would be ${qty} share${qty === 1 ? "" : "s"}, and the protocol's staged exit needs at least ${MIN_GUIDED_QTY} to scale out of. Skipped rather than placed as an all-or-nothing trade.`;
}

/** The share of the position that leaves at TP1, for copy that needs to say so. */
export const GUIDED_SCALE_OUT_PCT = SCALE_OUT_PCT;
