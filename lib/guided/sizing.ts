/**
 * Guided Decision Mode — how many shares, and what that actually risks.
 *
 * Pressing Buy or Sell must never mean "trade an unset quantity". The share
 * count is derived from the one number the user is entitled to have decided for them
 * conservatively — the share of their equity they are willing to lose on this
 * trade — divided by the distance from entry to stop. Everything the card says
 * in dollars is computed from the resulting quantity against the real
 * entry/stop/target prices, never from an advertised R-multiple.
 *
 * Five ceilings apply, in this order, and the smallest wins:
 *
 *   1. Risk cap        — riskPct of equity ÷ the entry-to-stop distance.
 *   2. Notional cap     — stocks only: a single trade may not exceed
 *                        maxTradeNotionalPct of equity, however tight the stop.
 *                        A structural entry sitting right on a level it has
 *                        held before often carries a very tight stop, and a
 *                        tight stop divided into even a small risk budget can
 *                        produce a triple-digit share count that is correctly
 *                        risk-sized but does not look or feel like one ordinary
 *                        trade to a novice. This cap keeps every guided stock
 *                        recommendation sized like a trade a person would
 *                        actually place. It does not apply to crypto, which is
 *                        already sized in fractional units against the same
 *                        risk budget. See lib/guided/config.ts.
 *   3. Portfolio cap   — what is left under the deployed-capital ceiling.
 *   4. Buying power    — a simulated cash account cannot buy what it cannot pay
 *                        for. This one does not apply to a short: the simulator
 *                        moves cash by the full notional either way, so a sell
 *                        *credits* cash rather than spending it (see
 *                        `executeFill` in lib/brokers/simulator.ts). Sizing a
 *                        short against buying power would be arithmetic on a
 *                        number that grows as the position grows.
 *   5. Tradeability    — below MIN_GUIDED_QTY the protocol's staged exit collapses
 *                        into a single all-or-nothing target, which is not the
 *                        trade the card describes. Below it, there is no trade.
 *
 * Because a short consumes no cash, the deployed-capital cap is the *only*
 * ceiling standing between a guided short and unbounded exposure. That is
 * deliberate and it is why the cap counts notional on both sides — see
 * lib/guided/caps.ts.
 *
 * Everything below is written in terms of "the risk side" and "the reward
 * side" rather than above/below, because a short is the mirror image of a long
 * and the arithmetic must not be duplicated per side to say so.
 */

import { MIN_GUIDED_QTY, DEFAULT_MAX_TRADE_NOTIONAL_PCT } from "@/lib/guided/config";
import { planProtocolExit, SCALE_OUT_PCT } from "@/lib/trade/protocol-exit";
import type { AssetClass } from "@/lib/types";

export interface SizingInputs {
  /**
   * Which way the trade goes. Required rather than defaulted: every price
   * relationship below inverts with it, so a caller that forgets would be
   * silently sized against a risk-per-share of the wrong sign.
   */
  side: "buy" | "sell";
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
  /**
   * Ceiling on a single trade's notional, as a percent of equity. Stocks only
   * — see the module header. Defaults to the shipped default so existing
   * callers (and tests) that don't pass it keep the same conservative
   * behaviour rather than an unbounded one.
   */
  maxTradeNotionalPct?: number;
  /** Capital already tied up in open guided positions, in dollars. */
  deployedUsd: number;
  /** Whole units only (equities). Crypto can be fractional at the broker, but the
   *  simulator's ledger and the protocol's tranche split are both whole-unit. */
  wholeUnitsOnly?: boolean;
  /**
   * Which asset this is. The notional cap applies only to `"us_equity"` —
   * crypto is unaffected. Defaults to `"us_equity"` so an existing caller that
   * doesn't pass it gets the safer behaviour, not the exemption.
   */
  assetClass?: AssetClass;
}

export interface SizedTrade {
  qty: number;
  /**
   * The position's notional at the entry price. Cash consumed on a long;
   * exposure taken on a short, which credits cash instead. Either way it is
   * what the deployed-capital cap counts.
   */
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
  boundBy: "risk" | "notional" | "portfolio" | "buying_power";
  /** Null when the trade is placeable; otherwise why it is not. */
  blockedReason: string | null;
}

export function sizeGuidedTrade(input: SizingInputs): SizedTrade {
  const {
    side, equity, buyingPower, entry, stopLoss, takeProfit1, masterProfit,
    riskPct, maxDeployedPct, deployedUsd, wholeUnitsOnly = true,
    maxTradeNotionalPct = DEFAULT_MAX_TRADE_NOTIONAL_PCT,
    assetClass = "us_equity",
  } = input;

  // +1 long, −1 short. Every price difference below is multiplied by it, so a
  // short's stop sitting *above* its entry produces the same positive risk per
  // share a long's stop below its entry does.
  const dir = side === "buy" ? 1 : -1;
  const riskPerShare = (entry - stopLoss) * dir;
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

  // Stocks only — see the module header. Crypto is exempt: `Number.POSITIVE_INFINITY`
  // makes this ceiling a no-op in the Math.min below.
  const byNotional =
    assetClass === "us_equity"
      ? (equity * (maxTradeNotionalPct / 100)) / entry
      : Number.POSITIVE_INFINITY;

  const deployableUsd = Math.max(equity * (maxDeployedPct / 100) - deployedUsd, 0);
  const byPortfolio = deployableUsd / entry;

  // A short credits cash instead of spending it, so buying power cannot bound
  // it — see the header. The portfolio cap above is what bounds a short's size.
  const byCash = side === "buy" ? Math.max(buyingPower, 0) / entry : Number.POSITIVE_INFINITY;

  const raw = Math.min(byRisk, byNotional, byPortfolio, byCash);
  const qty = wholeUnitsOnly ? Math.floor(raw) : Math.floor(raw * 1e6) / 1e6;

  // Which ceiling actually bit. Compared on the pre-rounding numbers, because
  // after flooring several of them can tie at the same integer.
  const boundBy: SizedTrade["boundBy"] =
    byPortfolio <= byRisk && byPortfolio <= byNotional && byPortfolio <= byCash
      ? "portfolio"
      : byCash <= byRisk && byCash <= byNotional
        ? "buying_power"
        : byNotional <= byRisk
          ? "notional"
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
  const tp1Gain = (takeProfit1 - entry) * dir * plan.scaleOutQty;
  const masterGain = (masterProfit - entry) * dir * (plan.masterQty + plan.runnerQty);

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
    if (boundBy === "buying_power") {
      return "There isn't enough cash in the paper account to open a position here.";
    }
    if (boundBy === "notional") {
      return "A single share of this symbol would already be more than Guided Mode's per-trade size limit for your paper equity.";
    }
    return "Your per-trade risk cap doesn't stretch to a single share of this symbol.";
  }
  return `A trade sized to your risk cap would be ${qty} share${qty === 1 ? "" : "s"}, and the protocol's staged exit needs at least ${MIN_GUIDED_QTY} to scale out of. Skipped rather than placed as an all-or-nothing trade.`;
}

/** The share of the position that leaves at TP1, for copy that needs to say so. */
export const GUIDED_SCALE_OUT_PCT = SCALE_OUT_PCT;
