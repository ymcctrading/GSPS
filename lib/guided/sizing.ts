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
 *   2. Portfolio cap   — what is left under the deployed-capital ceiling.
 *   3. Buying power    — a simulated cash account cannot buy what it cannot pay
 *                        for. This one does not apply to a short: the simulator
 *                        moves cash by the full notional either way, so a sell
 *                        *credits* cash rather than spending it (see
 *                        `executeFill` in lib/brokers/simulator.ts). Sizing a
 *                        short against buying power would be arithmetic on a
 *                        number that grows as the position grows.
 *   4. Per-trade budget — an optional flat dollar ceiling (`lib/guided/config.ts`),
 *                        on by default, that exists because the other three are
 *                        all percentages of paper equity: correct arithmetic
 *                        against a $100k paper account still prices a
 *                        recommendation in the tens of thousands, which is not a
 *                        number a novice sizing real trades can act on. Applies
 *                        to both sides — unlike buying power, a budget bounds
 *                        exposure taken, not just cash spent.
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

import { MIN_GUIDED_QTY } from "@/lib/guided/config";
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
  /** Ceiling on total guided capital deployed at once, as a percent of equity. */
  maxDeployedPct: number;
  /** Capital already tied up in open guided positions, in dollars. */
  deployedUsd: number;
  /** Flat per-trade dollar ceiling. `null`/`undefined` means no such ceiling applies. */
  maxNotionalUsd?: number | null;
  /** Whole units only (equities). Crypto can be fractional at the broker, but the
   *  simulator's ledger and the protocol's tranche split are both whole-unit. */
  wholeUnitsOnly?: boolean;
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
  boundBy: "risk" | "portfolio" | "buying_power" | "budget";
  /** Null when the trade is placeable; otherwise why it is not. */
  blockedReason: string | null;
}

export function sizeGuidedTrade(input: SizingInputs): SizedTrade {
  const {
    side, equity, buyingPower, entry, stopLoss, takeProfit1, masterProfit,
    riskPct, maxDeployedPct, deployedUsd, maxNotionalUsd = null, wholeUnitsOnly = true,
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

  const deployableUsd = Math.max(equity * (maxDeployedPct / 100) - deployedUsd, 0);
  const byPortfolio = deployableUsd / entry;

  // A short credits cash instead of spending it, so buying power cannot bound
  // it — see the header. The portfolio cap above is what bounds a short's size.
  const byCash = side === "buy" ? Math.max(buyingPower, 0) / entry : Number.POSITIVE_INFINITY;

  // Unlike buying power, the budget cap bounds exposure taken, not cash spent —
  // it applies to both sides. See the header for why this ceiling exists.
  const byBudget = maxNotionalUsd != null ? Math.max(maxNotionalUsd, 0) / entry : Number.POSITIVE_INFINITY;

  const raw = Math.min(byRisk, byPortfolio, byCash, byBudget);
  const qty = wholeUnitsOnly ? Math.floor(raw) : Math.floor(raw * 1e6) / 1e6;

  // Which ceiling actually bit. Compared on the pre-rounding numbers, because
  // after flooring several of them can tie at the same integer.
  const boundBy: SizedTrade["boundBy"] =
    byBudget <= byRisk && byBudget <= byPortfolio && byBudget <= byCash
      ? "budget"
      : byPortfolio <= byRisk && byPortfolio <= byCash
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
    if (boundBy === "budget") {
      return "A single share of this symbol costs more than your per-trade budget. Raise it in Settings → Guided Mode limits, or wait for a lower-priced setup.";
    }
    return boundBy === "buying_power"
      ? "There isn't enough cash in the paper account to open a position here."
      : "Your per-trade risk cap doesn't stretch to a single share of this symbol.";
  }
  const sizedTo = boundBy === "budget" ? "your per-trade budget" : "your risk cap";
  return `A trade sized to ${sizedTo} would be ${qty} share${qty === 1 ? "" : "s"}, and the protocol's staged exit needs at least ${MIN_GUIDED_QTY} to scale out of. Skipped rather than placed as an all-or-nothing trade.`;
}

/** The share of the position that leaves at TP1, for copy that needs to say so. */
export const GUIDED_SCALE_OUT_PCT = SCALE_OUT_PCT;
