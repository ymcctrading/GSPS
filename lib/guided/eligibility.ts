/**
 * What a scan has to be before it may become a one-tap recommendation.
 *
 * The scanner's job is to find setups; this is the narrower question of which
 * of them a novice may be shown as a Buy button with the score hidden. Every
 * gate here exists because the honest answer to "would I want my own money on
 * this, sight unseen" is no without it:
 *
 *   Execute only    — the app's own Backtest puts Watch-tier expectancy slightly
 *                     negative (-0.079R) over the period tested. A Watch setup
 *                     behind a friendly Buy button, shown to someone who can no
 *                     longer see the score, is a misleading interface regardless
 *                     of intent.
 *   Borrow          — a short needs shares to borrow. Alpaca will not lend every
 *                     listed name, and a recommendation the broker refuses on
 *                     submission is not a recommendation. Longs never need one,
 *                     so the check is asked only of the short side. Unknown is
 *                     treated as *not* shortable here — unlike the market scan,
 *                     which fails open to keep its list from going dark. A list
 *                     with one unborrowable row is a bad row a user can see; a
 *                     one-tap Sell button on one is an order that dies at the
 *                     broker after they have already committed.
 *   Priced plan     — no entry/stop/target, no risk figure to state in dollars,
 *                     and nothing for the staged exit to attach to.
 *   Liquidity floor — see lib/scan/liquidity.ts.
 *   Live data       — a plan computed on bars a full execution candle behind the
 *                     market is not a plan to act on; `scanTicker` already holds
 *                     those at Watch, so this is belt and braces rather than a
 *                     second opinion.
 *   Novice universe — `result.noviceUniverse`, the Market Universe, Data
 *                     Quality & Account Constraints engine's `novice_eligible`
 *                     read (lib/universe/eligibility.ts), computed by
 *                     `scanTicker` for every scan Guided runs. This is the
 *                     one gate here checking something other than "can this
 *                     trade be placed" — market cap, Novice-tier liquidity,
 *                     price/fractional accessibility, spread, event risk,
 *                     volatility, and data quality all have to clear before
 *                     a symbol is shown as a one-tap Buy, on top of every
 *                     gate above. `undefined` (a `ScanResult` built outside
 *                     `scanTicker`, e.g. a hand-built test fixture) fails
 *                     closed, matching this whole engine's "unknown data
 *                     defaults to block" rule rather than silently skipping
 *                     the gate. See docs/MARKET_UNIVERSE_DATA_QUALITY.md.
 *
 * Pure, and deliberately so: the reasons it produces are what the API logs and
 * what a maintainer reads when a symbol they expected did not appear.
 */

import type { ScanResult } from "@/lib/types";
import { meetsLiquidityFloor } from "@/lib/scan/liquidity";
import { MIN_GUIDED_QTY } from "@/lib/guided/config";

export interface EligibilityVerdict {
  eligible: boolean;
  /** Every gate that failed, in the order checked. Empty when eligible. */
  reasons: string[];
}

export function assessEligibility(
  result: ScanResult,
  /**
   * Whether the symbol can be borrowed. Only consulted for a short; pass it
   * whenever the direction might be bearish. Omitted reads as "not asked",
   * which fails a short rather than passing it.
   */
  shortable?: boolean,
): EligibilityVerdict {
  const reasons: string[] = [];

  if (result.error) {
    reasons.push(`Scan failed: ${result.error}`);
    return { eligible: false, reasons };
  }

  if (result.decision.outputState !== "Execute") {
    reasons.push(
      `Verdict is ${result.decision.outputState}, and Guided Mode only surfaces Execute setups.`,
    );
  }

  if (result.direction === "none") {
    reasons.push("No setup is armed in either direction.");
  }

  // A short that cannot be borrowed is an order that fails at submission. The
  // caller resolves borrow availability (it is a broker call, and this module
  // is pure); `undefined` means it was never asked, which for a short is not
  // an answer this may guess at.
  if (result.direction === "bearish" && shortable !== true) {
    reasons.push(
      shortable === false
        ? `${result.symbol} can't be borrowed to short right now, so the order would be refused at the broker.`
        : `Borrow availability for ${result.symbol} couldn't be confirmed, and a short is not recommended without it.`,
    );
  }

  if (!result.levels) {
    reasons.push("No trade plan priced — nothing to state a risk or a reward against.");
  } else if (result.levels.riskPerShare <= 0) {
    reasons.push("Entry and stop are the same price, so the trade has no risk to size against.");
  }

  if (!(result.currentPrice > 0)) {
    reasons.push("No current price available.");
  }

  const floor = meetsLiquidityFloor(result.liquidity ?? null, result.assetClass);
  if (!floor.ok) reasons.push(floor.reason!);

  if (result.dataLag?.holdsExecute) {
    reasons.push("The price data behind this plan is a full execution candle or more behind the market.");
  }

  if (!result.noviceUniverse?.eligible) {
    reasons.push(
      result.noviceUniverse
        ? `Not Novice-eligible: ${result.noviceUniverse.reasons[0] ?? "does not pass the Market Universe engine's filters."}`
        : `${result.symbol} has no Novice-eligibility read, and Guided Mode does not show a symbol it can't certify.`,
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Whether a re-scan still describes the trade a recommendation was written for.
 *
 * Called immediately before submission. A setup that de-armed, flipped
 * direction, dropped out of Execute, or was re-priced between the card being
 * rendered and the button being pressed is a different trade from the one the
 * user read, and the user agreed to the one they read.
 */
export function stillMatches(
  result: ScanResult,
  agreed: {
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    masterProfit: number;
    /** The side the user confirmed. A setup that flipped is a different trade. */
    direction: "bullish" | "bearish";
  },
  shortable?: boolean,
): { ok: boolean; reason: string | null } {
  const verdict = assessEligibility(result, shortable);
  if (!verdict.eligible) {
    return { ok: false, reason: verdict.reasons[0] };
  }

  if (result.direction !== agreed.direction) {
    return {
      ok: false,
      reason:
        "This setup has flipped direction since the recommendation was shown, so the order wasn't placed. Refresh for the current plan.",
    };
  }

  const levels = result.levels!;
  // A cent of drift is the rounding the levels are already stored at; anything
  // beyond that is a different plan, not the same plan re-expressed.
  const moved = (a: number, b: number) => Math.abs(a - b) > 0.011;
  if (
    moved(levels.entry, agreed.entry) ||
    moved(levels.stopLoss, agreed.stopLoss) ||
    moved(levels.takeProfit1, agreed.takeProfit1) ||
    moved(levels.masterProfit, agreed.masterProfit)
  ) {
    return {
      ok: false,
      reason:
        "The setup has been re-priced since this recommendation was shown, so the order wasn't placed. Refresh for the current plan.",
    };
  }

  return { ok: true, reason: null };
}

/** Whether a computed size is large enough for the protocol's staged exit. */
export function sizeIsTradeable(qty: number, minGuidedQty: number = MIN_GUIDED_QTY): boolean {
  return Number.isFinite(qty) && qty >= minGuidedQty;
}
