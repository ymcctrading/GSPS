/**
 * What the protocol actually does, in the words the UI is allowed to use.
 *
 * Settings and the marketing page both used to state "TP1: 2:1 reward-to-risk"
 * and "Master profit: 3:1". Neither number was ever what the engine computed.
 *
 * Since 2026-10-21 every market runs one model (lib/strat/levels.ts): the
 * stop from Gann's rule, TP1 the first key level that pays more than the risk,
 * the master the next level beyond it. Gann's rule is the same in every
 * market; only the unit changes (*Commodities* pp.43-45). Crypto used to price
 * TP1 at 1.5R and the master at 3R, an R-multiple model with no Gann source.
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
  EQUITY_MASTER_CAP_PCT,
  EQUITY_TP1_MAX_PCT,
  EQUITY_TP1_MIN_PCT,
  EQUITY_TP2_MAX_PCT,
  EQUITY_TP2_MIN_PCT,
} from "@/lib/strat/levelConstants";

const r = (n: number): string => `${n}R`;
const pctRange = (min: number, max: number): string => `${min}–${max}%`;

// Updated 2026-10-21 (review finding R-007). The copy still described the
// equity TP1 as a percent of entry scaled by the daily range, and both targets
// as places the position sells. Since 2026-10-21 the equity TP1 is the first
// Gann or support/resistance level in the band that pays more than the risk
// (lib/strat/levels.ts), and since Q14 (2026-10-16) nothing sells at a fixed
// target: `LIVE_EXIT_RULE` is "structure", so the whole position runs on Gann's
// stop and exit signals (lib/trade/protocol-exit.ts).
const NO_FIXED_TARGET =
  "Nothing is sold there: the method never fixes a profit objective, so the whole position runs on the trailing stop and the protocol's exit signals.";

/** "First level past the risk, 3-15% from entry". The same on every market. */
export const TP1_RULE_LABEL =
  `First key price level that pays more than the risk, ${pctRange(EQUITY_TP1_MIN_PCT, EQUITY_TP1_MAX_PCT)} from entry`;

export const TP1_RULE_DETAIL =
  `Every market (stocks, crypto, and futures, forex and commodities as they arrive): the first key price level (structural or clustered support/resistance) between ${EQUITY_TP1_MIN_PCT}% and ${EQUITY_TP1_MAX_PCT}% from entry that lies farther away than the stop. ` +
  `When no level in that band does, the nearest one is shown and the setup is held from Execute, since a first target no farther than the risk pays even money at best. ` +
  `With no level in the band at all, the target is set from the market's own average daily range, inside the same band. ` +
  NO_FIXED_TARGET;

/** "Next level beyond TP1, up to 30%". The same on every market. */
export const MASTER_RULE_LABEL =
  `Next key price level beyond TP1, up to ${EQUITY_MASTER_CAP_PCT}% from entry`;

export const MASTER_RULE_DETAIL =
  `Every market: the next key price level at least ${EQUITY_TP1_MIN_PCT}% beyond TP1, up to a ${EQUITY_MASTER_CAP_PCT}% ceiling. ` +
  `With none there, ${pctRange(EQUITY_TP2_MIN_PCT, EQUITY_TP2_MAX_PCT)} of entry, scaled by the market's average daily range. ` +
  NO_FIXED_TARGET;

/**
 * How the entry and stop are placed (PLAN.md item 4, 2026-10-15): the
 * reaction buy after a crossing, the same on every asset class. The entry is
 * the crossed level plus 1 point and the stop the level less 3 points, so the
 * risk is 4 points, inside the 5-point cap. Or (item 5, step 2) the buy rests
 * at an old bottom that held, the stop 3 points under it. Points are
 * price-scaled (`lib/gann/pointScale.ts`).
 */
export const STOP_RULE_LABEL = "Just beyond the old top or bottom the entry crossed or rests at, the low that held, or the week's high a rally is sold under, scaled to the price";

export const STOP_RULE_DETAIL =
  "Once price closes clearly past an old top, the buy rests just above that top and fills when price pulls back to it; the stop goes just below the top. " +
  "At a double or triple bottom the buy rests at the old bottom itself, with the stop just under it. " +
  "Once a low has held, the buy is at the last close, with the stop just under the low, and only while the risk stays within the limit. " +
  "A short is the mirror: after a close clearly under an old bottom, sell just below it, with the stop just above. On a bought put or call the premium paid is the stop: it is the most the option can lose.";

/**
 * The Execute threshold, stated in full.
 *
 * The score cutoff is necessary and never sufficient, which is why a setup at
 * or over it can show as Watch: `computeScore` holds the state when there is
 * no priced trade plan, and the holds in `lib/scoring/score.ts` hold it for a
 * range not yet broken away (`applyBreakawayHold`), a broken monthly low
 * (`applyMonthlyBreakHold`), a distribution breakdown still standing
 * (`applyDistributionBreakdownHold`), a failed top between the entry and the
 * first target (`applyFailedTopHold`), a counter-trend turn that came on no
 * dated time window (`applyTimeWindowHold`, Q19), a stock whose own buying
 * points mostly failed (`applyRuleFollowingHold`, Q24), a first target no
 * farther than the risk (M-K5, `tradePlanPriced`), the first or second time
 * through a round number (`applyFigureCrossingHold`), a weak stock bought in
 * an advancing market (`applyWeakStockHold`) and a stale feed
 * (`applyDataLagHold`). A broken stop drops it to Reject (`applyStopBreachHold`).
 * Settings used to state the score cutoff alone, so every hold looked like a
 * bug. No bar-sequence pattern holds a verdict since 2026-10-16 (N#1).
 */
export const EXECUTE_RULE_LABEL = `Score ${EXECUTE_SCORE_THRESHOLD}+ of ${TOTAL_POINTS}, with a priced trade plan`;

export const EXECUTE_RULE_DETAIL =
  "A setup also needs a buying or selling point with its entry, stop and targets priced. Execute is held back to Watch when the trade plan is missing, when the market sits in a narrow range and has not yet broken out of it, when the month has broken last month's low against the trade, when a distribution breakdown still stands against a buy, when a failed top stands between the entry and the first target, when a trade against the trend turned on no dated time window, when the stock's own buying points have mostly failed over the year, when the first target is no farther than the risk, when an entry crosses a round number for the first or second time, when a buy is in a stock that reads weak while the market advances, or when the price feed is a full execution candle or more behind the market. A setup whose price has already gone through its own stop drops to Reject.";
