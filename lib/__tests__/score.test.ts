import { describe, expect, it } from "vitest";
import type { ScanDecision, StratPattern, TrendReading } from "@/lib/types";
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

/**
 * A level only confirms confluence when it sits on the side that helps the
 * trade — a support floor for a long, a resistance ceiling for a short.
 *
 * Four committed real replay runs (docs/replay-runs/*.json) found
 * harmonicProximity passing correlated with *worse* expectancy than failing
 * it in all four, and fanProximity's sign was unstable between timeframes —
 * both consistent with a role-blind criterion mixing genuine confluence with
 * a headwind. See the comment on `wantedRole` in lib/scoring/score.ts.
 */
describe("computeScore proximity criteria respect level role", () => {
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
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      levels: null,
    };
  }

  function fanBreakdown(direction: "bullish" | "bearish", role: "support" | "resistance") {
    const decision = computeScore({
      ...baseInputs(direction),
      gann: {
        fanLines: [{ angle: "1x1", price: 100, distancePct: 0.1, role }],
        squareOf9: [],
        timeCycleActive: false,
        timeCycleDates: [],
      },
    });
    return decision.breakdown.find((b) => b.key === "fanProximity")!;
  }

  function s9Breakdown(direction: "bullish" | "bearish", role: "support" | "resistance") {
    const decision = computeScore({
      ...baseInputs(direction),
      gann: {
        fanLines: [],
        squareOf9: [{ degree: 90, price: 100, distancePct: 0.1, role }],
        timeCycleActive: false,
        timeCycleDates: [],
      },
    });
    return decision.breakdown.find((b) => b.key === "harmonicProximity")!;
  }

  it("passes a long on a nearby support line, not a nearby resistance line", () => {
    expect(fanBreakdown("bullish", "support").passed).toBe(true);
    expect(fanBreakdown("bullish", "resistance").passed).toBe(false);
  });

  it("passes a short on a nearby resistance line, not a nearby support line", () => {
    expect(fanBreakdown("bearish", "resistance").passed).toBe(true);
    expect(fanBreakdown("bearish", "support").passed).toBe(false);
  });

  it("applies the same role rule to the harmonic (Square of 9) criterion", () => {
    expect(s9Breakdown("bullish", "support").passed).toBe(true);
    expect(s9Breakdown("bullish", "resistance").passed).toBe(false);
    expect(s9Breakdown("bearish", "resistance").passed).toBe(true);
    expect(s9Breakdown("bearish", "support").passed).toBe(false);
  });

  it("still fails when no level of any role is within the band", () => {
    const decision = computeScore(baseInputs("bullish"));
    expect(decision.breakdown.find((b) => b.key === "fanProximity")?.passed).toBe(false);
    expect(decision.breakdown.find((b) => b.key === "harmonicProximity")?.passed).toBe(false);
  });

  it("skips a nearer wrong-role level to match a farther right-role one within the band", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        fanLines: [
          { angle: "1x1", price: 100, distancePct: 0.05, role: "resistance" },
          { angle: "2x1", price: 99, distancePct: 0.3, role: "support" },
        ],
        squareOf9: [],
        timeCycleActive: false,
        timeCycleDates: [],
      },
    });
    const item = decision.breakdown.find((b) => b.key === "fanProximity")!;
    expect(item.passed).toBe(true);
    expect(item.note).toContain("99.00");
  });
});
