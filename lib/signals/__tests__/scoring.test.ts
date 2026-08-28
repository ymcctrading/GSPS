import { describe, expect, it } from "vitest";
import { computeRulesAlignmentScore } from "../scoring";
import { evaluateDisqualifiers } from "../disqualifiers";
import { evaluateConfirmedReversal, evaluateRangeReversion } from "../states/scaffold";
import type { RulesAlignmentBreakdownItem, SignalGates } from "../types";

describe("computeRulesAlignmentScore", () => {
  it("excludes inapplicable components from the denominator instead of failing them", () => {
    const breakdown: RulesAlignmentBreakdownItem[] = [
      { key: "a", label: "a", points: 50, maxPoints: 50, applicable: true, passed: true, note: "" },
      { key: "b", label: "b", points: 50, maxPoints: 50, applicable: false, passed: false, note: "" },
    ];
    expect(computeRulesAlignmentScore(breakdown).score).toBe(100);
  });

  it("assigns tiers per the spec's bands", () => {
    const at = (score: number) => {
      const breakdown: RulesAlignmentBreakdownItem[] = [
        { key: "a", label: "a", points: score, maxPoints: 100, applicable: true, passed: true, note: "" },
      ];
      return computeRulesAlignmentScore(breakdown).tier;
    };
    expect(at(74)).toBe("watchlistOnly");
    expect(at(75)).toBe("qualified");
    expect(at(85)).toBe("aTier");
    expect(at(92)).toBe("aPlusTier");
  });
});

const BASE_GATES: SignalGates = {
  eligibleUniverse: true,
  operatingCandleClosed: true,
  staleData: false,
  binaryEventInHoldPeriod: false,
  liquiditySpreadPass: true,
  benchmarkSectorAlignment: true,
  targetRoomAvailable: true,
  stopWithinNovicePolicy: true,
  positionSizeAvailable: true,
  correlationConcentrationPass: true,
  cooldownPass: true,
  totalOpenRiskPass: true,
  dataQualityOk: true,
};

describe("evaluateDisqualifiers", () => {
  it("passes clean gates with no disqualifiers", () => {
    expect(evaluateDisqualifiers(BASE_GATES)).toHaveLength(0);
  });

  it("blocks on unknown binary-event status rather than assuming it's clear", () => {
    const dqs = evaluateDisqualifiers({ ...BASE_GATES, binaryEventInHoldPeriod: null });
    expect(dqs.some((d) => d.key === "binaryEvent")).toBe(true);
  });
});

describe("scaffolded states", () => {
  it("report notImplemented rather than fabricating undocumented rules", () => {
    expect(evaluateConfirmedReversal().status).toBe("notImplemented");
    expect(evaluateRangeReversion().status).toBe("notImplemented");
  });
});
