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
import { hasTradePlan, isMomentumContinuation, qualifiesAsContinuationFill } from "@/lib/marketScan";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";

function trend(
  timeframe: TrendReading["timeframe"],
  direction: TrendReading["direction"],
): TrendReading {
  return { timeframe, direction, support: [99], resistance: [101] };
}

/**
 * Every structural criterion passing — 8 of 9 without a pattern or levels.
 * gannAngleSlope and gannRetracementConfluence both read off `gann` alone
 * (not the computed trade `levels`), so only `patternArmed` needs an armed
 * pattern to pass — unlike the old `masterStructural` it replaced, which
 * needed `levels.masterFromStructure`.
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
  retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support" }],
  digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
};

const pattern: StratPattern = {
  name: "2-1-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 99,
  description: "",
};

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 99,
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
    hourlyAdx: { adx: 25, plusDI: 20, minusDI: 10 },
    swingChart: { threeDay: "bullish", nineDay: "bullish" },
    timePriceSquare: [
      { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, priceMove: 10, squared: true },
    ],
    volumeClimax: [
      { anchorKind: "low", anchorPrice: 90, relativeVolume: 2, climax: true },
    ],
    gann,
    nearSupportResistance: true,
    pattern,
    momentumElevated: true,
    stopAtrMultiple: 2,
    levels,
    ...overrides,
  };
}

describe("computeScore output state", () => {
  it("reaches Execute when the plan is priced", () => {
    const decision = computeScore(inputs());
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("holds at Watch when the context scores 7+ but no pattern is armed", () => {
    const decision = computeScore(inputs({ pattern: null, levels: null }));
    expect(decision.score).toBe(8);
    expect(decision.outputState).toBe("Watch");
    expect(decision.breakdown.at(-1)?.criterion).toMatch(/Trade plan priced/);
  });

  it("holds at Watch when a pattern armed but the levels failed to price", () => {
    const decision = computeScore(inputs({ levels: null }));
    expect(decision.outputState).toBe("Watch");
  });

  it("holds at Watch when the armed pattern opposes the scored direction", () => {
    const decision = computeScore(inputs({ pattern: { ...pattern, direction: "bearish" } }));
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
    }));
    expect(decision.breakdown).toHaveLength(9);
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

  it("rejects a scan with no armed pattern", () => {
    expect(hasTradePlan(result({ pattern: null, levels: null, direction: "none" }))).toBe(false);
  });

  it("rejects a scan whose levels failed to price", () => {
    expect(hasTradePlan(result({ levels: null, levelsError: "no risk to size against" }))).toBe(false);
  });

  it("rejects a scan carrying a non-finite level", () => {
    expect(hasTradePlan(result({ levels: { ...levels, masterProfit: Number.NaN } }))).toBe(false);
  });
});

describe("isMomentumContinuation", () => {
  it("accepts a priced continuation pattern running with the macro trend", () => {
    expect(isMomentumContinuation(continuation(), "bullish")).toBe(true);
  });

  it("rejects a reversal shape, however much momentum is behind it", () => {
    for (const name of ["2-2", "1-2-2", "3-2-2", "PMG"] as const) {
      expect(
        isMomentumContinuation(continuation({ pattern: { ...pattern, name } }), "bullish"),
      ).toBe(false);
    }
  });

  it("accepts the other continuation shape (3-1-2)", () => {
    expect(
      isMomentumContinuation(continuation({ pattern: { ...pattern, name: "3-1-2" } }), "bullish"),
    ).toBe(true);
  });

  it("rejects a flat tape — a continuation needs the range expansion", () => {
    expect(isMomentumContinuation(continuation({ momentumElevated: false }), "bullish")).toBe(false);
  });

  it("rejects a trend the macro timeframes do not confirm", () => {
    const chopped = continuation({
      trends: [
        trend("1Month", "bearish"),
        trend("1Week", "sideways"),
        trend("1Day", "bullish"),
        trend("1Hour", "bullish"),
      ],
    });
    expect(isMomentumContinuation(chopped, "bullish")).toBe(false);
  });

  it("does not count the hourly trend toward macro confirmation", () => {
    const hourlyOnly = continuation({
      trends: [
        trend("1Month", "sideways"),
        trend("1Week", "sideways"),
        trend("1Day", "bullish"),
        trend("1Hour", "bullish"),
      ],
    });
    expect(isMomentumContinuation(hourlyOnly, "bullish")).toBe(false);
  });

  it("rejects a setup pointing the other way", () => {
    expect(isMomentumContinuation(continuation(), "bearish")).toBe(false);
  });

  it("rejects a continuation with no priced plan", () => {
    expect(isMomentumContinuation(continuation({ levels: null }), "bullish")).toBe(false);
  });
});

/**
 * The continuation top-up pass's actual gate: shape alone (isMomentumContinuation)
 * is necessary but not sufficient — a candidate must also clear the same
 * Execute-tier bar a reversion earns on its own merits. Six 7/9s over
 * eighteen setups trailing off through 6, 5, 4 — a weak-but-shaped
 * continuation must not fill a slot just because it's the best one left.
 */
describe("qualifiesAsContinuationFill", () => {
  it("accepts a shaped continuation that clears the Execute bar", () => {
    expect(
      qualifiesAsContinuationFill(
        continuation({ decision: { score: EXECUTE_SCORE_THRESHOLD, outputState: "Execute", breakdown: [] } }),
        "bullish",
      ),
    ).toBe(true);
  });

  it("rejects a shaped continuation one point under the bar", () => {
    expect(
      qualifiesAsContinuationFill(
        continuation({
          decision: { score: EXECUTE_SCORE_THRESHOLD - 1, outputState: "Watch", breakdown: [] },
        }),
        "bullish",
      ),
    ).toBe(false);
  });

  it("rejects a high score that never armed the right shape", () => {
    expect(
      qualifiesAsContinuationFill(
        continuation({
          pattern: { ...pattern, name: "2-2" },
          decision: { score: 9, outputState: "Execute", breakdown: [] },
        }),
        "bullish",
      ),
    ).toBe(false);
  });
});

describe("continuation scoring", () => {
  const swingBullish = { threeDay: "bullish" as const, nineDay: "bullish" as const };
  const swingBearish = { threeDay: "bearish" as const, nineDay: "bearish" as const };

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

  it("names the pattern criterion after the trade it describes", () => {
    const asContinuation = computeScore(inputs({ setupKind: "continuation" }));
    expect(asContinuation.breakdown[5].criterion).toBe("Continuation pattern armed");
    expect(computeScore(inputs()).breakdown[5].criterion).toBe("Reversal pattern armed");
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
