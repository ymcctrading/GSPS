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
 * Four ceilings apply, and the smallest wins:
 *
 *   1. Risk cap        — riskPct of equity ÷ the entry-to-stop distance.
 *   2. Capital         — Gann's 30 points of capital behind every share held
 *                        (A-RISK-01, `lib/risk/gannCapital.ts`), counting the
 *                        shares already open. Replaced Guided's deployed-percent
 *                        and per-trade budget caps on 2026-10-16 (owner, Q12).
 *                        It bounds a short as well as a long.
 *   3. Buying power    — a simulated cash account cannot buy what it cannot pay
 *                        for. This one does not apply to a short: the simulator
 *                        moves cash by the full notional either way, so a sell
 *                        *credits* cash rather than spending it (see
 *                        `executeFill` in lib/brokers/simulator.ts). Sizing a
 *                        short against buying power would be arithmetic on a
 *                        number that grows as the position grows.
 *   4. Tradeability    — below MIN_GUIDED_QTY (one share since Q14, when the
 *                        staged exit was retired) there is no trade.
 *
 * Everything below is written in terms of "the risk side" and "the reward
 * side" rather than above/below, because a short is the mirror image of a long
 * and the arithmetic must not be duplicated per side to say so.
 */

import { MIN_GUIDED_QTY } from "@/lib/guided/config";
import { maxSharesForCapital } from "@/lib/risk/gannCapital";
import { planProtocolExit, SCALE_OUT_PCT } from "@/lib/trade/protocol-exit";

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
  /**
   * The capital `riskPct` applies to: Gann's trading unit (`gannRiskCapital`,
   * A-RISK-04), which stays at the starting capital until profits equal it.
   * Defaults to `equity`. The capital and cash ceilings still read equity.
   */
  riskCapital?: number;
  /**
   * Capital Gann's rule already holds behind open shares (and any trade sized
   * ahead of this one in the same batch), in dollars (`capitalHeld`).
   */
  capitalHeldUsd: number;
  /** Whole units only (equities). Crypto can be fractional at the broker, but the
   *  simulator's ledger and the protocol's tranche split are both whole-unit. */
  wholeUnitsOnly?: boolean;
  /** `getGuidedPolicy()`-resolved floor, defaulting to `MIN_GUIDED_QTY`. */
  minGuidedQty?: number;
}

export interface SizedTrade {
  qty: number;
  /**
   * The position's notional at the entry price. Cash consumed on a long;
   * exposure taken on a short, which credits cash instead.
   */
  notionalUsd: number;
  /** Dollars lost if the stop is hit on the whole position. */
  riskUsd: number;
  /**
   * Dollars made if the trade runs to the master take profit (MTP), the level
   * the card names. Since Q14 (2026-10-16) no target is fixed and nothing
   * sells at TP1, so the whole position counts; the exit itself comes on
   * Gann's signals, which can be before or past this level.
   */
  rewardUsd: number;
  /** Dollars made if the whole position is closed at TP1, the first level ahead. */
  rewardAtTp1Usd: number;
  /** Realised reward-to-risk of the staged plan, for the "why" panel. */
  rewardToRisk: number;
  /** Which ceiling decided the size — named so the card can say so. */
  boundBy: "risk" | "capital" | "buying_power";
  /** Null when the trade is placeable; otherwise why it is not. */
  blockedReason: string | null;
}

export function sizeGuidedTrade(input: SizingInputs): SizedTrade {
  const {
    side, equity, buyingPower, entry, stopLoss, takeProfit1, masterProfit,
    riskPct, riskCapital = equity, capitalHeldUsd, wholeUnitsOnly = true,
    minGuidedQty = MIN_GUIDED_QTY,
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

  const riskBudget = Math.min(riskCapital, equity) * (riskPct / 100);
  const byRisk = riskBudget / riskPerShare;

  const byCapital = maxSharesForCapital(equity - capitalHeldUsd, entry);

  // A short credits cash instead of spending it, so buying power cannot bound
  // it — see the header. Gann's capital rule above is what bounds a short.
  const byCash = side === "buy" ? Math.max(buyingPower, 0) / entry : Number.POSITIVE_INFINITY;

  const raw = Math.min(byRisk, byCapital, byCash);
  const qty = wholeUnitsOnly ? Math.floor(raw) : Math.floor(raw * 1e6) / 1e6;

  // Which ceiling actually bit. Compared on the pre-rounding numbers, because
  // after flooring several of them can tie at the same integer.
  const boundBy: SizedTrade["boundBy"] =
    byCapital <= byRisk && byCapital <= byCash ? "capital" : byCash <= byRisk ? "buying_power" : "risk";

  if (qty < minGuidedQty) {
    return {
      ...empty(blockedCopy(boundBy, qty, capitalHeldUsd > 0, minGuidedQty)),
      boundBy,
    };
  }

  // The reward figure has to describe the exit the order will actually place.
  // `planProtocolExit` owns that split, so it is asked rather than
  // approximated. Under the live rule nothing scales out (Q14), so the whole
  // position is valued at each named level.
  const plan = planProtocolExit(qty, { stopLoss, takeProfit1, masterProfit });
  const tp1Gain = (takeProfit1 - entry) * dir * (plan.scaleOutQty || qty);
  const masterGain = (masterProfit - entry) * dir * (plan.scaleOutQty ? plan.masterQty + plan.runnerQty : qty);

  const riskUsd = riskPerShare * qty;
  const rewardUsd = plan.scaleOutQty ? tp1Gain + masterGain : masterGain;

  return {
    qty,
    notionalUsd: entry * qty,
    riskUsd,
    rewardAtTp1Usd: tp1Gain,
    rewardUsd,
    rewardToRisk: riskUsd > 0 ? rewardUsd / riskUsd : 0,
    boundBy,
    blockedReason: null,
  };
}

function blockedCopy(boundBy: SizedTrade["boundBy"], qty: number, alreadyHeld: boolean, minGuidedQty: number): string {
  if (qty <= 0) {
    if (boundBy === "capital") {
      // Room already spent, versus an account too small for one share of this
      // symbol under the rule on its own.
      return alreadyHeld
        ? "The shares you already hold use the capital this account carries under GSPS's capital rule. Close a position to free it up."
        : "This account's capital doesn't carry a single share of this symbol under GSPS's capital rule.";
    }
    return boundBy === "buying_power"
      ? "There isn't enough cash in the paper account to open a position here."
      : "Your per-trade risk cap doesn't stretch to a single share of this symbol.";
  }
  const sizedTo = boundBy === "capital" ? "the capital rule" : "your risk cap";
  return `A trade sized to ${sizedTo} would be ${qty} share${qty === 1 ? "" : "s"}, and the protocol's minimum is ${minGuidedQty}. Skipped.`;
}

/** The share of the position that leaves at TP1, for copy that needs to say so. */
export const GUIDED_SCALE_OUT_PCT = SCALE_OUT_PCT;
