/**
 * Where each line of a setup brief comes from: the internal trace's
 * citations, keyed by `BriefRuleId`.
 *
 * The values are neutral record codes, the file names under
 * docs/memory-bank/sources/ plus pages, so that no string literal here names
 * a source (the repository is readable, and `scripts/check-banned-terms.mjs`
 * reads every runtime string literal). The titles and quotations are in the
 * comments, which no build ships:
 *
 * - A2_1 = Master Course (Form Reading pp. 239-251; Ch. 2; Ch. 5 p. 158).
 * - A02 = Truth of the Stock Tape (old tops as support; stops beyond old
 *   tops and bottoms; a new high falling back is a failure signal).
 * - A05 = New Stock Trend Detector (double and triple tops, "definite rule").
 * - A08 = How to Make Profits in Commodities (p. 53 the 3rd test decides;
 *   pp. 43-45 never buck the trend).
 * - W006 = the reading record's New Stock Trend Detector work (Rules 3(b)-(c)).
 *
 * Rule by rule:
 * - trendWith: higher tops and bottoms up, lower down (A2_1 pp. 239, 249-251).
 * - trendAgainst / setAside: "never buck the trend" (A08 pp. 43-45, rule 5).
 * - lowerTops: "Weakest: 3rd or 4th lower top, then break of the last low"
 *   (A2_1 p. 248); higherBottoms its mirror.
 * - overbalance: a reaction exceeding the campaign's greatest by 1 point or
 *   more signals a change in trend (A2_1 pp. 245-246, PDF 249).
 * - levelTests / fourthTest: "at old bottoms or old tops ... safe the 1st,
 *   2nd or 3rd time; the 4th time is dangerous" (A2_1 pp. 240-241).
 * - levelFailed / levelCrossed: the 3rd test decides; a triple top crossed is
 *   a strong breakout (A08 p. 53; A05).
 * - twoSidedDoubt: "wait until it shows a definite change in trend" (A2_1 p. 251).
 * - threePointBreak: "broken by 3 full points => lower before any important
 *   rally" (A2_1 pp. 246-248).
 * - fivePointReversal: after crossing an old top, strong markets seldom go
 *   more than 3 back under it; "more than 5 below => trend reversed (for the
 *   time being)" (A2_1 pp. 246-248); an old top gives support the first time
 *   price reacts back to it (A02).
 * - bearRallyWeeks: "Bear-market rallies 2-4 weeks; if a rally holds into the
 *   5th week, it is likely to run into the 6th or 7th" (A2_1 p. 249). Carried
 *   as the plan's rule, not as a measured cycle: it has not been through
 *   Dewey's checklist or a replay measurement (spec, PR 2).
 * - entryCrossing / awaitsCrossing: the reaction buy 1 point past a crossed
 *   level, the crossing confirmed by a close 3 points past it (W006 p. 20,
 *   pp. 46-47; lib/gann/entryTrigger.ts).
 * - entryOldLevel: Buy 1 / Sell 1 at old bottoms and tops (A2_1 pp. 240-241).
 * - entryHold: a bottom that has held (lib/gann/heldLevel.ts).
 * - stopOldLevel: stops 3 points beyond old tops or bottoms (A02; A2_1 pp. 246-248).
 * - levelSwing: old tops and bottoms as resistance and support (A2_1 Ch. 2; A02).
 * - levelRangeFraction: the range in eighths and thirds, 1/2 the gravity
 *   centre (A2_1 Ch. 2; lib/gann/retracement.ts).
 */

import type { BriefRuleId } from "@/lib/setups/brief";

export const BRIEF_RULE_SOURCES: Record<BriefRuleId, string> = {
  trendWith: "A2_1 pp. 239, 249-251",
  trendAgainst: "A08 pp. 43-45",
  lowerTops: "A2_1 p. 248",
  higherBottoms: "A2_1 p. 248",
  overbalance: "A2_1 pp. 245-246",
  levelTests: "A2_1 pp. 240-241",
  fourthTest: "A2_1 pp. 240-241",
  levelFailed: "A08 p. 53; A05",
  levelCrossed: "A08 p. 53",
  setAside: "A08 pp. 43-45",
  twoSidedDoubt: "A2_1 p. 251",
  threePointBreak: "A2_1 pp. 246-248",
  fivePointReversal: "A2_1 pp. 246-248; A02",
  bearRallyWeeks: "A2_1 p. 249",
  entryCrossing: "W006 p. 20, pp. 46-47",
  entryOldLevel: "A2_1 pp. 240-241",
  entryHold: "PLAN.md item 5, step 4",
  stopOldLevel: "A02; A2_1 pp. 246-248",
  levelSwing: "A2_1 Ch. 2; A02",
  levelRangeFraction: "A2_1 Ch. 2",
  awaitsCrossing: "W006 p. 46",
};

/** The trace with each rule's record code, for the owner's review. */
export function citeTrace(rules: readonly BriefRuleId[]): { rule: BriefRuleId; source: string }[] {
  return rules.map((rule) => ({ rule, source: BRIEF_RULE_SOURCES[rule] }));
}
