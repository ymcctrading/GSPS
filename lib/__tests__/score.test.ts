import { describe, expect, it } from "vitest";
import type { GannLevels, ScanDecision, StratPattern, TrendReading } from "@/lib/types";
import { applyReversionConfirmation, computeScore, type ScoreInputs } from "@/lib/scoring/score";

function pattern(name: StratPattern["name"]): StratPattern {
  return {
    name,
    direction: "bullish",
    triggerPrice: 100,
    stopPrice: 95,
    description: "",
  };
}

// applyReversionConfirmation reads the score's own (role-aware) historicalSR
// verdict off the breakdown rather than a duplicate raw boolean, so the test
// double needs that entry present to stand in for "S/R confirmed".
function executeDecision(srPassed: boolean): ScanDecision {
  return {
    score: 8,
    outputState: "Execute",
    breakdown: [{ key: "historicalSR", criterion: "Historical support/resistance", passed: srPassed, note: "" }],
  };
}

describe("applyReversionConfirmation", () => {
  it("downgrades a bare 2-2 Execute to Watch when unconfirmed", () => {
    const result = applyReversionConfirmation(executeDecision(false), pattern("2-2"), false, false);
    expect(result.outputState).toBe("Watch");
    expect(result.breakdown.at(-1)?.criterion).toMatch(/Reversion confirmation/);
  });

  it("downgrades a bare 2-2 when only one of momentum/S-R confirms", () => {
    expect(applyReversionConfirmation(executeDecision(false), pattern("2-2"), true, false).outputState).toBe("Watch");
    expect(applyReversionConfirmation(executeDecision(true), pattern("2-2"), false, true).outputState).toBe("Watch");
  });

  it("leaves a bare 2-2 as Execute when both momentum and S/R confirm", () => {
    const result = applyReversionConfirmation(executeDecision(true), pattern("2-2"), true, true);
    expect(result.outputState).toBe("Execute");
    expect(result.breakdown).toHaveLength(1);
  });

  it("does not touch a compound pattern (1-2-2) even when unconfirmed", () => {
    const result = applyReversionConfirmation(executeDecision(false), pattern("1-2-2"), false, false);
    expect(result.outputState).toBe("Execute");
  });

  it("does not upgrade a 2-2 that is already Watch/Reject", () => {
    const watch: ScanDecision = { score: 5, outputState: "Watch", breakdown: [] };
    expect(applyReversionConfirmation(watch, pattern("2-2"), false, false).outputState).toBe("Watch");
  });

  it("passes through a null pattern unchanged", () => {
    const result = applyReversionConfirmation(executeDecision(false), null, false, false);
    expect(result.outputState).toBe("Execute");
  });
});

const EMPTY_GANN: GannLevels = {
  fanLines: [],
  squareOf9: [],
  timeCycleActive: false,
  timeCycleBullishActive: false,
  timeCycleBearishActive: false,
  timeCycleDates: [],
  angleSlopes: [],
  retracementLevels: [],
  digitalRootConfluences: [],
};

/**
 * A level only confirms confluence when it sits on the side that helps the
 * trade — a support floor for a long, a resistance ceiling for a short.
 *
 * Four committed real replay runs (docs/replay-runs/*.json) found
 * harmonicProximity passing correlated with *worse* expectancy than failing
 * it in all four, and the fan-line criterion it shared a band with was
 * dead on t-stat (retired 2026-09-10, replaced by gannAngleSlope) — both
 * consistent with a role-blind criterion mixing genuine confluence with a
 * headwind. See the comment on `wantedRole` in lib/scoring/score.ts.
 */
describe("computeScore volumeClimax", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  function climaxBreakdown(
    direction: "bullish" | "bearish",
    anchorKind: "low" | "high",
    climax: boolean,
  ) {
    const decision = computeScore({
      ...baseInputs(direction),
      volumeClimax: [{ anchorKind, anchorPrice: 100, relativeVolume: climax ? 2 : 1, climax }],
    });
    return decision.breakdown.find((b) => b.key === "volumeClimax")!;
  }

  it("reads the low anchor for a bullish setup and the high anchor for a bearish one", () => {
    // A high-anchored climax reading shouldn't confirm a bullish setup, and
    // vice versa — only the direction-matched anchor counts.
    expect(climaxBreakdown("bullish", "low", true).passed).toBe(true);
    expect(climaxBreakdown("bullish", "high", true).passed).toBe(false);
    expect(climaxBreakdown("bearish", "high", true).passed).toBe(true);
    expect(climaxBreakdown("bearish", "low", true).passed).toBe(false);
  });

  it("fails when the direction-matched anchor didn't print on a climax", () => {
    expect(climaxBreakdown("bullish", "low", false).passed).toBe(false);
  });

  it("fails when there is no measurable reading at all", () => {
    const decision = computeScore(baseInputs("bullish"));
    expect(decision.breakdown.find((b) => b.key === "volumeClimax")?.passed).toBe(false);
  });
});

describe("computeScore gannAngleSlope", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  it("passes a bullish setup holding at/above the 1x1 angle off the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.2, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
          { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 5, slope: -0.5, nearestAngle: { label: "1x2", ratio: 0.5, direction: "down" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });

  // Loosened 2026-09-11: confirmed starved (2.2%/1.9% pass rate on two
  // independent large-sample unconditioned runs, one also significantly
  // inverted) when it required 1x1-or-steeper — see
  // lib/validation/criteria-registry.ts's gannAngleSlope entry. Now accepts
  // 1x2-or-steeper, the next rung down on the same ANGLES ladder
  // (lib/gann/fans.ts).
  it("passes a bullish setup holding at/above the (looser) 1x2 angle off the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 0.6, nearestAngle: { label: "1x2", ratio: 0.5, direction: "up" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });

  it("fails a bullish setup below the low-anchor 1x2 angle", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 0.2, nearestAngle: { label: "1x4", ratio: 0.25, direction: "up" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(false);
  });

  it("reads the high anchor for a bearish setup, not the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bearish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.2, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
          { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 5, slope: -1.3, nearestAngle: { label: "1x1", ratio: 1, direction: "down" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });
});

describe("computeScore gannRetracementConfluence", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  it("never gates on digital-root/vortex confluence alone — a retracement match is also required", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(false);
  });

  it("does not pass on the retracement match alone without digital-root confluence", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support" }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 2, timeRoot: 5, type: "NO_CONFLUENCE" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(false);
  });

  it("passes when the role-matched retracement zone and digital-root confluence agree", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support" }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(true);
  });

  it("ignores a wrong-role retracement zone", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "resistance" }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(false);
  });
});

// 2026-09-11: us_equity's stopRoom asks "did this stop come from a real
// structural level, not the fallback" instead of "is the stop >= 1.5x ATR" —
// see hasStopRoom's own comment in lib/scoring/score.ts for why the R/ATR
// question stopped meaning anything once equities moved to the percent model.
describe("computeScore stopRoom (equities)", () => {
  function baseInputs(direction: "bullish" | "bearish", stopFromStructure: boolean | undefined): ScoreInputs {
    return {
      direction,
      macroTrends: [],
      hourlyTrend: { timeframe: "1Day", direction: "sideways", support: [], resistance: [] },
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      assetClass: "us_equity",
      levels:
        stopFromStructure === undefined
          ? null
          : ({ stopFromStructure } as unknown as ScoreInputs["levels"]),
    };
  }

  it("passes when the equity stop is anchored to real structure", () => {
    const decision = computeScore(baseInputs("bullish", true));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(true);
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.criterion).toBe("Stop backed by real structure");
  });

  it("fails when the equity stop fell back to the fixed percentage", () => {
    const decision = computeScore(baseInputs("bullish", false));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("fails when no equity trade plan was priced at all", () => {
    const decision = computeScore(baseInputs("bullish", undefined));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("ignores stopAtrMultiple entirely for equities, even when supplied", () => {
    // A caller that still computes stopAtrMultiple (both real call sites do,
    // for every asset class) must not let it leak into the equity verdict.
    const decision = computeScore({ ...baseInputs("bullish", false), stopAtrMultiple: 5 });
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("keeps the ATR-multiple question for non-equity asset classes", () => {
    const decision = computeScore({
      ...baseInputs("bullish", false),
      assetClass: "crypto",
      stopAtrMultiple: 2,
    });
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(true);
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.criterion).toMatch(/ATR/);
  });
});
