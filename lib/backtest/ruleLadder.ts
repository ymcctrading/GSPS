/**
 * The rule ladder: GSPS's existing selection rules, in the order they are
 * added back to the bare core strategy one at a time (the 2026-10-29 rebuild,
 * owner: "let's rebuild from the core"). A rung is kept only when it improves
 * the core on years it was not decided on (`lib/backtest/walkForward.ts`).
 * Plan, budget and the pre-registered keep rule: `docs/RULE_LADDER.md`.
 *
 * Why an ordered ladder and not a search. Gann gave the order he checked a
 * trade in: his pre-trade checklist, "How to Trade" (Master Course Ch. 7, Nov
 * 1935, PDF 234-238; restated Ch. 10A, Aug 1939, PDF 293-294; numbered C1-C15
 * in `gann-feature-map/review/score-pillars-research.md`). Fixing the order
 * before any run means each rung is one test, not the best of many tries, so
 * a lucky ordering cannot manufacture an edge. The order below is that
 * checklist's, then his instrument checks, then the holds (C14, "when not to
 * trade", leads them):
 *
 *   1. marketCycle        C1-C2: the year's forecast, the stock's own cycle
 *   2. timeFactors        C3-C5: time squaring on the monthly, weekly, daily
 *   3. priceLevels        C6-C7: resistance levels, half-way points, held levels
 *   4. volumeAccumulation C8: the volume trend
 *   5. geometricAngles    C10: "the most important factor", the angles
 *   6. definiteIndication C11-C12: a definite indication, the stop placed
 *   7. trendAllTimeframes C13: monthly, weekly and daily confirming
 *   8. relativeStrength   S4-S10: buy the strong, sell the weak
 *   9. activity           S1-S3: active stocks that follow the rules
 *  10-20. the holds, C14 first (the breakaway from a narrow range), then in
 *      the live scan's order (`REPLAY_HOLD_KEYS`).
 *
 * C9 (the greatest reaction) is read inside P9 and the rule-following hold,
 * so it has no rung of its own.
 *
 * Each rung reads GSPS's own reading of the session the core enters on
 * (`readSessionRules`): the pillar as the live scan scores it, or the hold as
 * it would hold an Execute. Where GSPS priced no buying point on that side
 * that session, every pillar rung refuses (there is nothing scored to pass)
 * and every hold rung allows (there is nothing to hold).
 *
 * Hermetic lens (Cause and Effect): each rung is one cause added alone, so its
 * effect is its own. Law of Creation: core ⊗ rule is a creation only when the
 * pair interacts, which is exactly what the out-of-sample gain asks; a rule
 * that adds nothing out of sample is a mixture and stays out.
 */

import type { Bar } from "@/lib/types";
import { CRITERION_KEYS, EXECUTE_SCORE_THRESHOLD, type CriterionKey } from "@/lib/scoring/weights";
import { REPLAY_HOLD_KEYS, readSessionRules, type ReplayHoldKey, type SessionRuleReading, type SessionSeries } from "@/lib/backtest/replay";

/** The candidate first entry a core rule is asked about (the core walker's `CoreEntryContext`, the fields read here). */
export interface LadderEntryContext {
  symbol: string;
  side: "long" | "short";
  /** The ET date ("YYYY-MM-DD") of the session the entry is decided on; only bars closed before it are read. */
  asOf: string;
}

/** A rule the core walker calls at each candidate first entry (its `CoreRule`). */
export interface LadderRule {
  name: string;
  allows(ctx: LadderEntryContext): boolean;
}

export type LadderRungKind = "pillar" | "hold";

export interface LadderRung {
  /** The rule's name in the core's `rulesPassed`/`rulesRefused`. */
  name: string;
  kind: LadderRungKind;
  key: CriterionKey | ReplayHoldKey;
  /** Where Gann gives it (internal citation, never shown to a user). */
  source: string;
}

const PILLAR_ORDER: ReadonlyArray<readonly [CriterionKey, string]> = [
  ["marketCycle", "Master Course Ch. 7 C1-C2 (annual forecast, the stock's own cycle)"],
  ["timeFactors", "Master Course Ch. 7 C3-C5 (time squaring on monthly, weekly, daily)"],
  ["priceLevels", "Master Course Ch. 7 C6-C7 (resistance levels, half-way points, held levels)"],
  ["volumeAccumulation", "Master Course Ch. 7 C8 (the volume trend)"],
  ["geometricAngles", "Master Course Ch. 7 C10 (angles, 'the most important factor')"],
  ["definiteIndication", "Master Course Ch. 7 C11-C12 (definite indication, the stop)"],
  ["trendAllTimeframes", "Master Course Ch. 7 C13 (monthly, weekly, daily confirming)"],
  ["relativeStrength", "Truth of the Stock Tape Ch. XVII; Stock Selector Ch. VII (strong and weak)"],
  ["activity", "Truth of the Stock Tape Ch. VIII Rule 7; NSTD pp. 20, 34-35 (active stocks)"],
];

const HOLD_SOURCES: Record<ReplayHoldKey, string> = {
  breakaway: "Master Course Ch. 7 C14; Commodities pp. 51-52 (stay out of a narrow range until it breaks away)",
  monthlyBreak: "W006 pp. 40-43 (a break of the prior month's low warns)",
  distributionBreakdown: "W006 pp. 39-40 (volume Rule 2, a narrow spell broken on volume)",
  failedTop: "W006 pp. 19-24 (a top price failed at is resistance)",
  timeWindow: "W036 p. 22; Master Course PDF 202, 440 (a counter-trend turn needs time and price)",
  ruleFollowing: "NSTD pp. 20, 34-35 (trade stocks that follow the rules)",
  weakStock: "Truth of the Stock Tape Ch. XIX; NSTD p. 35 (weak stocks are not bought)",
  campaignSection: "Master Course pp. 244-245 (the third or fourth section marks the culmination)",
  marketTrend: "45 Years in Wall Street Rule 1, p. 6 (trade stocks that conform to the averages)",
  figureCrossing: "A-LEVELS-08 (the third time through a round number)",
  readyNow: "W006 Rules 3(b)-(c); M-K5 (targets ahead, profits exceed losses)",
};

// C14 leads the holds; the rest keep the live scan's order.
const HOLD_ORDER: readonly ReplayHoldKey[] = ["breakaway", ...REPLAY_HOLD_KEYS.filter((k) => k !== "breakaway")];

/** The ladder, in the order it is climbed. Fixed before any run. */
export const RULE_LADDER: readonly LadderRung[] = [
  ...PILLAR_ORDER.map(([key, source]) => ({ name: `pillar:${key}`, kind: "pillar" as const, key, source })),
  ...HOLD_ORDER.map((key) => ({ name: `hold:${key}`, kind: "hold" as const, key, source: HOLD_SOURCES[key] })),
];

/**
 * Reference rules: read and reported against the core alone, never kept.
 * They say what GSPS's own verdict would have done to the core.
 */
export const REFERENCE_RULES = ["ref:plan", "ref:score7", "ref:execute"] as const;
export type ReferenceRule = (typeof REFERENCE_RULES)[number];

/** Every rule name a tagged core run records. */
export const LADDER_RULE_NAMES: readonly string[] = [...RULE_LADDER.map((r) => r.name), ...REFERENCE_RULES];

// Guard: the ladder names every pillar and every hold exactly once.
if (new Set(RULE_LADDER.map((r) => r.key)).size !== CRITERION_KEYS.length + REPLAY_HOLD_KEYS.length) {
  throw new Error("RULE_LADDER must name every pillar and hold once");
}

/** Whether one rule allows an entry, given GSPS's reading of that session and side. */
export function ruleAllows(name: string, reading: SessionRuleReading): boolean {
  if (name === "ref:plan") return reading.plan;
  if (name === "ref:score7") return reading.score !== null && reading.score >= EXECUTE_SCORE_THRESHOLD;
  if (name === "ref:execute") return reading.outputState === "Execute";
  const rung = RULE_LADDER.find((r) => r.name === name);
  if (!rung) throw new Error(`Unknown ladder rule "${name}"`);
  if (rung.kind === "pillar") return reading.pillars[rung.key] === true;
  return !reading.holdsFired.includes(rung.key as ReplayHoldKey);
}

/** The series a symbol's readings are built from: `run.replaySeriesOptions(...)` plus the stored filings facts. */
export type LadderSeries = SessionSeries & { dailyBars: Bar[] };

/**
 * The ladder's rules for one symbol, for the core walker's hook (`opts.rules`).
 * Every rule reads one cached reading per session and side, so a tagged run
 * that asks all of them pays for one reading per candidate entry.
 */
export function ladderRules(
  symbol: string,
  series: LadderSeries,
  names: readonly string[] = LADDER_RULE_NAMES,
  read: typeof readSessionRules = readSessionRules,
): LadderRule[] {
  const cache = new Map<string, SessionRuleReading>();
  const readingFor = (ctx: LadderEntryContext): SessionRuleReading => {
    const side = ctx.side === "short" ? "bearish" : "bullish";
    const key = `${ctx.asOf}|${side}`;
    let reading = cache.get(key);
    if (!reading) {
      reading = read(symbol, ctx.asOf, side, series);
      cache.set(key, reading);
    }
    return reading;
  };
  return names.map((name) => {
    ruleAllows(name, { plan: false, score: null, outputState: null, pillars: {}, holdsFired: [] }); // validates the name
    return { name, allows: (ctx: LadderEntryContext) => ruleAllows(name, readingFor(ctx)) };
  });
}
