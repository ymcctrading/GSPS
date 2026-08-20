/**
 * What the protocol actually does, in the words the UI is allowed to use.
 *
 * Settings and the marketing page both used to state "TP1: 2:1 reward-to-risk"
 * and "Master profit: 3:1". Neither number was ever what the engine computed.
 * `computeTradeLevels` prices TP1 at 1.5R (or the previous candle's extreme when
 * that is further) and the master target at the asset class's runner multiple —
 * 2.5R on equities, 3R on crypto — snapping to a Gann or harmonic level when one
 * sits in range, which puts the realised master anywhere from 2.5R to the 5R cap.
 *
 * A number on the Settings page that the engine does not use is not a rounding
 * error, it is a false statement about the user's risk, and Guided Decision Mode
 * makes it load-bearing: there the user is shown a dollar figure instead of the
 * levels, so a wrong ratio is invisible rather than merely wrong. Every piece of
 * copy that describes the targets is now generated from the same constants the
 * engine prices against, so the two cannot drift apart again.
 */

import {
  MASTER_CAP_R,
  MAX_STOP_ATR_MULTIPLE,
  TP1_MULTIPLE_BY_ASSET,
  TP2_MULTIPLE_BY_ASSET,
} from "@/lib/strat/levels";

const r = (n: number): string => `${n}R`;

/** "1.5R" — TP1 is the same multiple on both asset classes today. */
export const TP1_RULE_LABEL: string =
  TP1_MULTIPLE_BY_ASSET.us_equity === TP1_MULTIPLE_BY_ASSET.crypto
    ? r(TP1_MULTIPLE_BY_ASSET.us_equity)
    : `${r(TP1_MULTIPLE_BY_ASSET.us_equity)} on stocks, ${r(TP1_MULTIPLE_BY_ASSET.crypto)} on crypto`;

export const TP1_RULE_DETAIL =
  `${TP1_RULE_LABEL} from entry, or the previous candle's high/low when that structural target is further away.`;

/** "2.5R on stocks, 3R on crypto". */
export const MASTER_RULE_LABEL = `${r(TP2_MULTIPLE_BY_ASSET.us_equity)} on stocks, ${r(TP2_MULTIPLE_BY_ASSET.crypto)} on crypto`;

export const MASTER_RULE_DETAIL =
  `${MASTER_RULE_LABEL} — stepped out to the nearest support or key price level when one sits in range, up to a ${r(MASTER_CAP_R)} ceiling.`;

/** How the stop is placed. The 12–18%-of-price band never applied to equities. */
export const STOP_RULE_LABEL = `Structural, capped at ${MAX_STOP_ATR_MULTIPLE}× the execution candle`;

export const STOP_RULE_DETAIL =
  `One tick beyond the trigger candle, widened by a tenth of an average execution candle so noise can't take it out, and never wider than ${MAX_STOP_ATR_MULTIPLE}× that candle. The 12–18% band applies to option premium, not to share price.`;

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
  "A setup also needs an armed pattern with entry, stop and targets priced from it. Execute is held back to Watch when the trade plan is missing, when a bare 2-2 reversal lacks both momentum and support/resistance confirmation, or when the price feed is a full execution candle or more behind the market.";
