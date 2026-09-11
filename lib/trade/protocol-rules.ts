/**
 * What the protocol actually does, in the words the UI is allowed to use.
 *
 * Settings and the marketing page both used to state "TP1: 2:1 reward-to-risk"
 * and "Master profit: 3:1". Neither number was ever what the engine computed.
 *
 * As of 2026-09-11 the two asset classes run genuinely different models, not
 * just different multiples of the same one — see lib/strat/levels.ts's own
 * comment for why. **Crypto** (and any other non-equity class) still prices
 * TP1 at 1.5R and the master target at the class's runner multiple (3R),
 * snapping to a Gann or harmonic level in range, up to the 5R cap — a
 * leveraged instrument's 1:1-payoff problem does not apply, so R:R stays the
 * model there. **US equities** price both targets and the stop as a
 * percentage of purchase price instead: an unlevered stock is a 1:1 payoff,
 * which makes demanding a 2:1 move structurally harder than on a levered
 * instrument, and R:R does not describe what a novice swing trader actually
 * experiences ("the stock is up 8%", not "I am up 1.6R").
 *
 * A number on the Settings page that the engine does not use is not a
 * rounding error, it is a false statement about the user's risk, and Guided
 * Decision Mode makes it load-bearing: there the user is shown a dollar
 * figure instead of the levels, so a wrong ratio is invisible rather than
 * merely wrong. Every piece of copy below is generated from the same
 * constants each model prices against, so the two cannot drift apart again.
 */

import {
  EQUITY_FALLBACK_STOP_PCT,
  EQUITY_LARGE_CAP_FALLBACK_STOP_PCT,
  EQUITY_LARGE_CAP_STOP_MAX_PCT,
  EQUITY_MASTER_CAP_PCT,
  EQUITY_STOP_BUFFER_PCT,
  EQUITY_STOP_MAX_PCT,
  EQUITY_STOP_MIN_PCT,
  EQUITY_TP1_MAX_PCT,
  EQUITY_TP1_MIN_PCT,
  EQUITY_TP2_MAX_PCT,
  EQUITY_TP2_MIN_PCT,
  MASTER_CAP_R,
  MAX_STOP_ATR_MULTIPLE,
  TP1_MULTIPLE_BY_ASSET,
  TP2_MULTIPLE_BY_ASSET,
} from "@/lib/strat/levels";

// LARGE_CAP_LEEWAY_ATR / LARGE_CAP_MAX_STOP_ATR_MULTIPLE (the R-based
// widening) are deliberately not imported here: that mechanism only ever
// applied to a non-crypto assetClass (i.e. us_equity), which now
// short-circuits to the percent model before that ATR-leeway logic runs at
// all, and crypto always disabled it explicitly — so it cannot describe real
// behavior for either asset class anymore. Its replacement,
// EQUITY_LARGE_CAP_STOP_MAX_PCT/EQUITY_LARGE_CAP_FALLBACK_STOP_PCT, is what
// STOP_RULE_DETAIL below actually describes for stocks.

const r = (n: number): string => `${n}R`;
const pctRange = (min: number, max: number): string => `${min}–${max}%`;

/** "3-15% on stocks, 1.5R on crypto". */
export const TP1_RULE_LABEL =
  `${pctRange(EQUITY_TP1_MIN_PCT, EQUITY_TP1_MAX_PCT)} on stocks, ${r(TP1_MULTIPLE_BY_ASSET.crypto)} on crypto`;

export const TP1_RULE_DETAIL =
  `Stocks: ${pctRange(EQUITY_TP1_MIN_PCT, EQUITY_TP1_MAX_PCT)} of entry price, scaled by the stock's own average daily range so a volatile name aims further than a quiet one. ` +
  `Crypto: ${r(TP1_MULTIPLE_BY_ASSET.crypto)} from entry, or the previous candle's high/low when that structural target is further away.`;

/** "6-25% on stocks, 3R on crypto". */
export const MASTER_RULE_LABEL =
  `${pctRange(EQUITY_TP2_MIN_PCT, EQUITY_TP2_MAX_PCT)} on stocks, ${r(TP2_MULTIPLE_BY_ASSET.crypto)} on crypto`;

export const MASTER_RULE_DETAIL =
  `Stocks: ${pctRange(EQUITY_TP2_MIN_PCT, EQUITY_TP2_MAX_PCT)} of entry price, stepped out to the nearest support or key price level when one sits in range, up to a ${EQUITY_MASTER_CAP_PCT}% ceiling. ` +
  `Crypto: ${r(TP2_MULTIPLE_BY_ASSET.crypto)} — stepped out to the nearest support or key price level when one sits in range, up to a ${r(MASTER_CAP_R)} ceiling.`;

/** How the stop is placed on each asset class. */
export const STOP_RULE_LABEL =
  `Nearest support/resistance level, ${pctRange(EQUITY_STOP_MIN_PCT, EQUITY_STOP_MAX_PCT)} away (stocks); structural, capped at ${MAX_STOP_ATR_MULTIPLE}× the execution candle (crypto)`;

export const STOP_RULE_DETAIL =
  `Stocks: the nearest support (long) or resistance (short) level between ${EQUITY_STOP_MIN_PCT}% and ${EQUITY_STOP_MAX_PCT}% of entry price, placed ${EQUITY_STOP_BUFFER_PCT}% beyond it — loose enough that ordinary day-to-day moves shouldn't trigger it. When no level lands in that band, the stop falls back to a fixed ${EQUITY_FALLBACK_STOP_PCT}% of purchase price. Large-cap stocks get more room on both: the accepted band widens to ${EQUITY_LARGE_CAP_STOP_MAX_PCT}% and the fallback to ${EQUITY_LARGE_CAP_FALLBACK_STOP_PCT}%, so an ordinary swing in a mega-cap name isn't mistaken for a stop-out. ` +
  `Crypto: one tick beyond the trigger candle, widened by a tenth of an average execution candle so noise can't take it out, and never wider than ${MAX_STOP_ATR_MULTIPLE}× that candle. The 12–18% band applies to option premium, not to share price.`;

/**
 * The Execute threshold, stated in full.
 *
 * Score 7 is necessary and never sufficient, which is why a 7-scored setup can
 * show as Watch: `computeScore` holds the state when there is no priced trade
 * plan to act on, `applyReversionConfirmation` holds a bare 2-2 that lacks
 * momentum and support/resistance confirmation, and `applyDataLagHold` holds
 * anything computed on bars a full execution candle behind the market. Settings
 * used to state the score cutoff alone, so every hold looked like a bug.
 */
export const EXECUTE_RULE_LABEL = "Score 7+ of 9, with a priced trade plan";

export const EXECUTE_RULE_DETAIL =
  "A setup also needs an armed pattern with entry, stop and targets priced from it. Execute is held back to Watch when the trade plan is missing, when a bare failed-push reversal lacks both momentum and support/resistance confirmation, or when the price feed is a full execution candle or more behind the market.";
