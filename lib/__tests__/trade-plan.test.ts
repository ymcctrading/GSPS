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
import { hasTradePlan, isMomentumContinuation } from "@/lib/marketScan";

function trend(
  timeframe: TrendReading["timeframe"],
  direction: TrendReading["direction"],
): TrendReading {
  return { timeframe, direction, support: [99], resistance: [101] };
}

/** Every structural criterion passing — 7 of 9 without a pattern or levels. */
const gann: GannLevels = {
  fanLines: [{ angle: "1x1", price: 100, distancePct: 0.2 }],
  squareOf9: [{ degree: 90, price: 100, distancePct: 0.1 }],
  timeCycleActive: true,
  timeCycleDates: ["2026-08-05"],
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
  stopPctOfPrice: 1,
  stopBandWarning: null,
};

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    direction: "bullish",
    macroTrends: [
      trend("1Month", "bearish"),
      trend("1Week", "bearish"),
      trend("1Day", "bearish"),
    ],
    hourlyTrend: trend("1Hour", "bullish"),
    gann,
    nearSupportResistance: true,
    pattern,
    momentumElevated: true,
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
    expect(decision.score).toBe(7);
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
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
      nearSupportResistance: false,
      momentumElevated: false,
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

describe("continuation scoring", () => {
  const macroBullish = [
    trend("1Month", "bullish"),
    trend("1Week", "bullish"),
    trend("1Day", "bullish"),
  ];

  it("credits a continuation for a macro trend running WITH it", () => {
    const decision = computeScore(inputs({ setupKind: "continuation", macroTrends: macroBullish }));
    const macro = decision.breakdown[0];
    expect(macro.passed).toBe(true);
    expect(macro.note).toMatch(/intact/);
  });

  it("fails a continuation whose trend the macro timeframes contradict", () => {
    const decision = computeScore(inputs({ setupKind: "continuation" }));
    expect(decision.breakdown[0].passed).toBe(false);
  });

  it("names the pattern criterion after the trade it describes", () => {
    const asContinuation = computeScore(inputs({ setupKind: "continuation" }));
    expect(asContinuation.breakdown[5].criterion).toBe("Continuation pattern armed");
    expect(computeScore(inputs()).breakdown[5].criterion).toBe("Reversal pattern armed");
  });

  it("can still reach 9/9 as a continuation — nothing structurally caps it", () => {
    const decision = computeScore(inputs({ setupKind: "continuation", macroTrends: macroBullish }));
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("still scores a reversion on the extended-move question", () => {
    expect(computeScore(inputs({ macroTrends: macroBullish })).breakdown[0].passed).toBe(false);
    expect(computeScore(inputs()).breakdown[0].passed).toBe(true);
  });
});

describe("volume filtering", () => {
  it("accepts a setup with normal volume", () => {
    const decision = computeScore(inputs({ volumeRatio: 1.0 }));
    expect(decision.outputState).toBe("Execute");
    expect(decision.score).toBe(9);
  });

  it("accepts a setup with above-average volume", () => {
    const decision = computeScore(inputs({ volumeRatio: 1.5 }));
    expect(decision.outputState).toBe("Execute");
    expect(decision.score).toBe(9);
  });

  it("rejects low-volume setups when momentum is not elevated", () => {
    const decision = computeScore(inputs({ volumeRatio: 0.5, momentumElevated: false }));
    expect(decision.outputState).toBe("Reject");
    expect(decision.score).toBe(0);
    expect(decision.breakdown[0].criterion).toMatch(/Adequate liquidity/);
    expect(decision.breakdown[0].passed).toBe(false);
  });

  it("accepts low-volume setups when momentum is elevated", () => {
    const decision = computeScore(inputs({ volumeRatio: 0.5, momentumElevated: true }));
    expect(decision.outputState).toBe("Execute");
    expect(decision.score).toBe(9);
  });

  it("explains the liquidity reason in the breakdown", () => {
    const rejected = computeScore(inputs({ volumeRatio: 0.3, momentumElevated: false }));
    const accepted = computeScore(inputs({ volumeRatio: 0.3, momentumElevated: true }));
    expect(rejected.breakdown[0].note).toContain("30%");
    expect(rejected.breakdown[0].note).toContain("insufficient");
    expect(accepted.breakdown).not.toContainEqual(
      expect.objectContaining({ criterion: expect.stringMatching(/Adequate liquidity/) }),
    );
  });
});
