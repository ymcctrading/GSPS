/**
 * A scored row is a trade plan or it is nothing. These guard the two places a
 * scan without entry/stop/TP1/master used to leak through as an actionable
 * setup: the score's output state, and the daily market-scan lists.
 */

import { describe, expect, it } from "vitest";
import type {
  GannLevels,
  ScanResult,
  StratPattern,
  TradeLevels,
  TrendReading,
} from "@/lib/types";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";
import { passingPillarFacts } from "@/lib/scoring/__tests__/pillarFixtures";
import { hasTradePlan, isWithTrendContinuation, mergeContinuations, qualifiesAsContinuationFill } from "@/lib/marketScan";
import { CRITERION_KEYS, EXECUTE_SCORE_THRESHOLD, type CriterionWeights } from "@/lib/scoring/weights";

/**
 * These fixtures check raw pass/fail arithmetic against fixed score values
 * (9, 8, 7...) — only meaningful when every criterion is worth one point.
 * `DEFAULT_CRITERION_WEIGHTS` (what `computeScore` falls back to when no
 * `weights` is supplied) is uniform again as of 2026-09-16, so it matches
 * this today — but it is still supplied explicitly, so a future change to
 * the live default cannot silently break these fixtures. See that constant's
 * own doc comment in lib/scoring/weights.ts.
 */
const UNIFORM_WEIGHTS: CriterionWeights = Object.fromEntries(
  CRITERION_KEYS.map((k) => [k, 1]),
) as CriterionWeights;

function trend(
  timeframe: TrendReading["timeframe"],
  direction: TrendReading["direction"],
): TrendReading {
  return { timeframe, direction, support: [99], resistance: [101] };
}

/**
 * Every original structural criterion passing — 7 of 8 without a pattern or
 * levels. gannAngleSlope and gannRetracementConfluence both read off `gann`
 * alone (not the computed trade `levels`), so only `patternArmed` needs an
 * armed pattern to pass — unlike the old `masterStructural` it replaced,
 * which needed `levels.masterFromStructure`. `ruleOfThree` (added
 * 2026-09-16) is deliberately left unsupplied in `inputs()` below — it
 * always fails here, so every score in this file is one point lower than a
 * literal "all nine pass" run would read; the exact numbers below already
 * account for that. `adxTrendStrength` (removed 2026-09-16) no longer
 * exists to supply or count.
 */
const gann: GannLevels = {
  fanLines: [],
  squareOf9: [{ degree: 90, price: 100, distancePct: 0.1, role: "support" }],
  timeCycleActive: true,
  timeCycleBullishActive: true,
  timeCycleBearishActive: false,
  timeCycleDates: ["2026-08-05"],
  angleSlopes: [
    { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
  ],
  retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support", importance: 1 }],
  digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
};

const pattern: StratPattern = {
  name: "2-1-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 99,
  description: "",
};

/**
 * What actually arms the trade since 2026-09-17 — the swing-level crossing
 * (`lib/gann/entryTrigger.ts`), not the bar sequence above. Same prices, so
 * each fixture's intent is unchanged; `pattern` stays for the display role.
 */
const gannTrigger = { direction: "bullish" as const, triggerPrice: 100, stopPrice: 99 };

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 99,
  stopBehindOldLevel: true,
  takeProfit1: 102,
  takeProfit2: 103,
  masterProfit: 103,
  riskPerShare: 1,
  rewardToRiskTp1: 2,
  rewardToRiskTp2: 3,
  rewardToRiskMaster: 3,
  masterFromStructure: true,
  stopPctOfPrice: 1,
  stopBandWarning: null,
};

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    direction: "bullish",
    // Macro trend now scores agreement with the trade, not the old
    // counter-trend-into-a-level premise, so the "everything passes"
    // baseline wants bullish macro trends for a bullish trade.
    macroTrends: [
      trend("1Month", "bullish"),
      trend("1Week", "bullish"),
      trend("1Day", "bullish"),
    ],
    hourlyTrend: trend("1Hour", "bullish"),
    swingChart: { threeDay: "bullish", weekly: "bullish" },
    timePriceSquare: [
      { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 10, priceMove: 10, priceMovePoints: 10, squared: true },
    ],
    volumeClimax: [
      { anchorKind: "low", anchorPrice: 90, anchorIndex: 0, relativeVolume: 2, bestRecentRelativeVolume: 2, climax: true, dryingUp: false, retestOnLowerVolume: false, confirms: true },
    ],
    gann,
    nearSupportResistance: true,
    pattern,
    gannTrigger,
    momentumElevated: true,
    stopAtrMultiple: 2,
    levels,
    weights: UNIFORM_WEIGHTS,
    pillarFacts: passingPillarFacts(),
    ...overrides,
  };
}

describe("computeScore output state", () => {
  it("reaches Execute when the plan is priced", () => {
    const decision = computeScore(inputs());
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("holds at Watch when the first target is no farther than the risk (M-K5)", () => {
    // "Don't risk 3-5 points for 3-5" (Stock Selector Ch.II): equal risk and reward is refused.
    const even = { ...levels, takeProfit1: 101, rewardToRiskTp1: 1 };
    const decision = computeScore(inputs({ levels: even }));
    expect(decision.outputState).toBe("Watch");
    expect(decision.breakdown.at(-1)?.note).toMatch(/no farther than the risk/);
  });

  it("holds at Watch when the context scores 6+ but no trigger is armed", () => {
    // `gannTrigger` is what arms the trade now; `pattern` no longer does.
    // With no plan there is no stop either, so the definite-indication point fails (Q23).
    const decision = computeScore(inputs({ pattern: null, gannTrigger: null, levels: null }));
    expect(decision.score).toBe(8);
    expect(decision.outputState).toBe("Watch");
    expect(decision.breakdown.at(-1)?.criterion).toMatch(/Trade plan priced/);
  });

  it("holds at Watch when a pattern armed but the levels failed to price", () => {
    const decision = computeScore(inputs({ levels: null }));
    expect(decision.outputState).toBe("Watch");
  });

  it("holds at Watch when the armed trigger opposes the scored direction", () => {
    const decision = computeScore(
      inputs({ gannTrigger: { ...gannTrigger, direction: "bearish" as const } }),
    );
    expect(decision.score).toBe(8);
    expect(decision.outputState).toBe("Watch");
  });

  it("leaves a low score alone rather than annotating it", () => {
    const decision = computeScore(inputs({
      pattern: null,
      levels: null,
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
      volumeClimax: [],
      nearSupportResistance: false,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      pillarFacts: null,
    }));
    // Nine points and the nine checks they are built from.
    expect(decision.breakdown).toHaveLength(18);
    expect(decision.outputState).toBe("Reject");
  });
});

function result(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "TEST",
    assetClass: "us_equity",
    scannedAt: "2026-08-04T12:00:00.000Z",
    currentPrice: 100,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: true,
    trends: [],
    gann,
    pattern,
    armedPatterns: [pattern],
    levels,
    decision: { score: 8, outputState: "Execute", breakdown: [] },
    ...overrides,
  };
}

/** A scan that qualifies as a bullish momentum continuation. */
function continuation(overrides: Partial<ScanResult> = {}): ScanResult {
  return result({
    setupKind: "continuation",
    momentumElevated: true,
    pattern: { ...pattern, name: "2-1-2" },
    trends: [
      trend("1Month", "bullish"),
      trend("1Week", "bullish"),
      trend("1Day", "bullish"),
      trend("1Hour", "bullish"),
    ],
    ...overrides,
  });
}

describe("hasTradePlan", () => {
  it("accepts a scan with a pattern and four finite levels", () => {
    expect(hasTradePlan(result())).toBe(true);
  });

  it("rejects a scan with no armed trigger (no levels)", () => {
    expect(hasTradePlan(result({ pattern: null, levels: null, direction: "none" }))).toBe(false);
  });

  it("publishes a priced plan with no bar-sequence pattern", () => {
    expect(hasTradePlan(result({ pattern: null }))).toBe(true);
  });

  it("rejects a scan whose levels failed to price", () => {
    expect(hasTradePlan(result({ levels: null, levelsError: "no risk to size against" }))).toBe(false);
  });

  it("rejects a scan carrying a non-finite level", () => {
    expect(hasTradePlan(result({ levels: { ...levels, masterProfit: Number.NaN } }))).toBe(false);
  });
  // A plan whose stop is already broken is retired (owner, 2026-09-30) and is
  // not a setup: production published 11 of 14 such plans on 2026-10-16.
  it("rejects a plan the scan reports broken", () => {
    expect(hasTradePlan(result({ stopBreach: { stop: 99, price: 98.5, reclaimAt: 105 } }))).toBe(false);
    expect(hasTradePlan(result({ stopBreach: { stop: 526.57, price: 544.9, reclaimAt: 520 } }))).toBe(false);
  });

  it("rejects a plan whose stop price is already through, long and short", () => {
    expect(hasTradePlan(result({ currentPrice: 98 }))).toBe(false);
    const short = { ...levels, entry: 100, stopLoss: 101, takeProfit1: 98, takeProfit2: 97, masterProfit: 97 };
    expect(hasTradePlan(result({ direction: "bearish", levels: short, currentPrice: 102 }))).toBe(false);
    expect(hasTradePlan(result({ direction: "bearish", levels: short, currentPrice: 100.5 }))).toBe(true);
  });
});

/**
 * The continuation pass's admission (PLAN.md item 6 step 11, A-TREND-09:
 * "never too high to buy so long as the trend is up, provided you place a
 * stop", W006 p.22). The trend alone admits a priced plan: Gann's weighted
 * trend over the monthly, weekly and daily charts. The momentum, daily-only,
 * two-of-three breadth and Execute-score gates these tests used to pin had no
 * source in Gann and were removed with it.
 */
describe("isWithTrendContinuation", () => {
  it("accepts a priced setup running with the trend", () => {
    expect(isWithTrendContinuation(continuation(), "bullish")).toBe(true);
  });

  it("does not depend on the bar-sequence shape", () => {
    for (const name of ["2-2", "1-2-2", "3-2-2", "PMG", "3-1-2"] as const) {
      expect(isWithTrendContinuation(continuation({ pattern: { ...pattern, name } }), "bullish")).toBe(true);
    }
    expect(isWithTrendContinuation(continuation({ pattern: null }), "bullish")).toBe(true);
  });

  it("follows the monthly and weekly over a daily reaction against them", () => {
    const reacting = continuation({
      trends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bearish"), trend("1Hour", "bearish")],
    });
    expect(isWithTrendContinuation(reacting, "bullish")).toBe(true);
  });

  it("needs no momentum: a quiet tape running with the trend is admitted", () => {
    expect(isWithTrendContinuation(continuation({ momentumElevated: false }), "bullish")).toBe(true);
  });

  it("rejects a setup against the weighted trend", () => {
    const against = continuation({
      trends: [trend("1Month", "bearish"), trend("1Week", "sideways"), trend("1Day", "bullish"), trend("1Hour", "bullish")],
    });
    expect(isWithTrendContinuation(against, "bullish")).toBe(false);
  });

  it("does not count the hourly trend", () => {
    const hourlyOnly = continuation({
      trends: [trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "sideways"), trend("1Hour", "bullish")],
    });
    expect(isWithTrendContinuation(hourlyOnly, "bullish")).toBe(false);
  });

  it("rejects a setup pointing the other way", () => {
    expect(isWithTrendContinuation(continuation(), "bearish")).toBe(false);
  });

  it("rejects a continuation with no priced plan", () => {
    expect(isWithTrendContinuation(continuation({ levels: null }), "bullish")).toBe(false);
  });
});

describe("qualifiesAsContinuationFill", () => {
  it("admits a with-trend plan under the Execute bar: it competes for a slot by score", () => {
    expect(
      qualifiesAsContinuationFill(
        continuation({ decision: { score: EXECUTE_SCORE_THRESHOLD - 1, outputState: "Watch", breakdown: [] } }),
        "bullish",
      ),
    ).toBe(true);
  });

  it("rejects a high score against the trend", () => {
    expect(
      qualifiesAsContinuationFill(
        continuation({
          trends: [trend("1Month", "bearish"), trend("1Week", "bearish"), trend("1Day", "bullish"), trend("1Hour", "bullish")],
          decision: { score: 9, outputState: "Execute", breakdown: [] },
        }),
        "bullish",
      ),
    ).toBe(false);
  });
});

describe("mergeContinuations", () => {
  const scored = (symbol: string, score: number, overrides: Partial<ScanResult> = {}) =>
    continuation({ symbol, decision: { score, outputState: score >= EXECUTE_SCORE_THRESHOLD ? "Execute" : "Watch", breakdown: [] }, ...overrides });

  it("ranks the with-trend setups with the reversions for the same slots", () => {
    const reversions = [scored("B", 7, { setupKind: "reversion" }), scored("A", 3, { setupKind: "reversion" })];
    const { list, added } = mergeContinuations(reversions, [scored("C", 6), scored("D", 5)], "bullish", 2);
    expect(list.map((r) => r.symbol)).toEqual(["B", "C"]);
    expect(added).toBe(1);
  });

  it("is not limited to two slots when they outscore the reversions", () => {
    const { list, added } = mergeContinuations([scored("A", 2, { setupKind: "reversion" })], [scored("C", 6), scored("D", 5), scored("E", 4)], "bullish", 3);
    expect(list.map((r) => r.symbol)).toEqual(["C", "D", "E"]);
    expect(added).toBe(3);
  });

  it("leaves out a scan against the trend, or one that failed", () => {
    const against = scored("F", 9, { trends: [trend("1Month", "bearish"), trend("1Week", "bearish"), trend("1Day", "bearish"), trend("1Hour", "bearish")] });
    const failed = { ...scored("G", 9), error: "no bars" };
    expect(mergeContinuations([], [against, failed], "bullish", 5).list).toEqual([]);
  });
});

describe("continuation scoring", () => {
  const swingBullish = { threeDay: "bullish" as const, weekly: "bullish" as const };
  const swingBearish = { threeDay: "bearish" as const, weekly: "bearish" as const };

  it("credits a continuation for swing charts running WITH it", () => {
    const decision = computeScore(inputs({ setupKind: "continuation", swingChart: swingBullish }));
    const swing = decision.breakdown[0];
    expect(swing.passed).toBe(true);
    expect(swing.note).toMatch(/intact/);
  });

  it("fails a continuation whose trend the swing charts contradict", () => {
    const decision = computeScore(inputs({ setupKind: "continuation", swingChart: swingBearish }));
    expect(decision.breakdown[0].passed).toBe(false);
  });

  it("names the trigger criterion after the trade it describes", () => {
    const asContinuation = computeScore(inputs({ setupKind: "continuation" }));
    expect(asContinuation.breakdown[4].criterion).toBe("Continuation entry trigger armed");
    expect(computeScore(inputs()).breakdown[4].criterion).toBe("Reversal entry trigger armed");
  });

  it("can still reach 9/9 as a continuation — nothing structurally caps it", () => {
    const decision = computeScore(inputs({ setupKind: "continuation", swingChart: swingBullish }));
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("scores the swing chart criterion identically for reversion and continuation now (agreement, not counter-trend)", () => {
    expect(computeScore(inputs({ swingChart: swingBullish })).breakdown[0].passed).toBe(true);
    expect(
      computeScore(inputs({ setupKind: "continuation", swingChart: swingBullish })).breakdown[0]
        .passed,
    ).toBe(true);
    expect(computeScore(inputs({ swingChart: swingBearish })).breakdown[0].passed).toBe(false);
    expect(
      computeScore(inputs({ setupKind: "continuation", swingChart: swingBearish })).breakdown[0]
        .passed,
    ).toBe(false);
  });
});
