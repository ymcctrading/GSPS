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

import { EXECUTE_SCORE_THRESHOLD, TOTAL_POINTS } from "@/lib/scoring/weights";
import {
  EQUITY_LARGE_CAP_FALLBACK_STOP_PCT,
  EQUITY_LARGE_CAP_STOP_MAX_PCT,
  EQUITY_MASTER_CAP_PCT,
  EQUITY_TP1_MAX_PCT,
  EQUITY_TP1_MIN_PCT,
  EQUITY_TP2_MAX_PCT,
  EQUITY_TP2_MIN_PCT,
  MASTER_CAP_R,
  MAX_STOP_ATR_MULTIPLE,
  TP1_MULTIPLE_BY_ASSET,
  TP2_MULTIPLE_BY_ASSET,
} from "@/lib/strat/levels";

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

/**
 * How the entry and stop are placed (PLAN.md item 4, 2026-10-15): the
 * reaction buy after a crossing, the same on every asset class. The entry is
 * the crossed level plus 1 point and the stop the level less 3 points, so the
 * risk is 4 points, inside the 5-point cap. Or (item 5, step 2) the buy rests
 * at an old bottom that held, the stop 3 points under it. Points are
 * price-scaled (`lib/gann/pointScale.ts`).
 */
export const STOP_RULE_LABEL = "3 points beyond the old top or bottom the entry crossed or rests at, the low that held, or the week's high a rally is sold under, scaled to the price";

export const STOP_RULE_DETAIL =
  "Once price closes 3 points past an old top, the buy rests 1 point above that top and fills when price pulls back to it; the stop goes 3 points below the top. " +
  "At a double or triple bottom the buy rests at the old bottom itself, with the stop 3 points under it. " +
  "Once a low has held into its second week, the buy is at the last close, with the stop 3 points under the low, and only while that risks no more than 5 points. " +
  "So a crossing risks 4 points, a double or triple bottom 3, and a buy over a low that held up to 5, the limit. Points grow with the price: 3 points is about 7% of a $40 stock, 5% at $100 and under 4% at $200. " +
  "A short is the mirror: after a close 3 points under an old bottom, sell 1 point below it, with the stop 3 points above. The 12–18% band applies to option premium, not to share price.";

/**
 * The Execute threshold, stated in full.
 *
 * The score cutoff is necessary and never sufficient, which is why a setup at
 * or over it can show as Watch: `computeScore` holds the state when there is
 * no priced trade plan, and the holds in `lib/scoring/score.ts` hold it for a
 * range not yet broken away (`applyBreakawayHold`), a broken monthly low
 * (`applyMonthlyBreakHold`), a distribution breakdown still standing
 * (`applyDistributionBreakdownHold`), a failed top between the entry and the
 * first target (`applyFailedTopHold`) and a stale feed (`applyDataLagHold`).
 * Settings used to state the score cutoff alone, so every hold looked like a
 * bug. No bar-sequence pattern holds a verdict since 2026-10-16 (N#1).
 */
export const EXECUTE_RULE_LABEL = `Score ${EXECUTE_SCORE_THRESHOLD}+ of ${TOTAL_POINTS}, with a priced trade plan`;

export const EXECUTE_RULE_DETAIL =
  "A setup also needs a buying or selling point with its entry, stop and targets priced. Execute is held back to Watch when the trade plan is missing, when the market sits in a narrow range and has not yet broken out of it, when the month has broken last month's low against the trade, when a distribution breakdown still stands against a buy, when a failed top stands between the entry and the first target, or when the price feed is a full execution candle or more behind the market.";
