/**
 * The scoring model does not leave the server.
 *
 * `ScanDecision.breakdown` names every criterion, the threshold it tests and
 * the value that passed or failed it. It used to be serialised whole into
 * `/api/scan`, so the model was readable from a network response whether or
 * not the UI rendered it. These tests hold the boundary: what crosses it is a
 * pillar rollup, and nothing a reader could reassemble the criteria from.
 */

import { describe, expect, it } from "vitest";
import type {
  GannLevels,
  ScanDecision,
  ScanResult,
  StratPattern,
  TradeLevels,
  TrendReading,
} from "@/lib/types";
import { applyReversionConfirmation, computeScore, type ScoreInputs } from "@/lib/scoring/score";
import {
  redactDecision,
  redactScanResult,
  toPublicScoreSummary,
  SCORE_PILLARS,
} from "@/lib/scoring/public-summary";

const trend = (direction: TrendReading["direction"]): TrendReading => ({
  timeframe: "1Day",
  direction,
  support: [90],
  resistance: [110],
});

const gann: GannLevels = {
  fanLines: [{ angle: "1x4 (high)", price: 101, distancePct: 0.4 }],
  squareOf9: [{ degree: 45, price: 100.5, distancePct: 0.2 }],
  timeCycleActive: true,
  timeCycleDates: ["2026-08-06"],
};

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 85,
  takeProfit1: 130,
  takeProfit2: 145,
  masterProfit: 145,
  riskPerShare: 15,
  rewardToRiskTp1: 2,
  rewardToRiskTp2: 3,
  rewardToRiskMaster: 3,
  masterFromStructure: true,
  stopPctOfPrice: 15,
  stopBandWarning: null,
};

const pattern: StratPattern = {
  name: "2-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 95,
  description: "",
};

const allPass: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bearish"), trend("bearish"), trend("bearish")],
  hourlyTrend: trend("bullish"),
  gann,
  nearSupportResistance: true,
  pattern,
  momentumElevated: true,
  levels,
};

const allFail: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bullish"), trend("bullish"), trend("bullish")],
  hourlyTrend: trend("bearish"),
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
  nearSupportResistance: false,
  pattern: null,
  momentumElevated: false,
  levels: null,
};

describe("toPublicScoreSummary", () => {
  it("accounts for every scored criterion exactly once", () => {
    const summary = toPublicScoreSummary(computeScore(allPass));

    expect(summary.max).toBe(9);
    expect(summary.pillars.reduce((n, p) => n + p.total, 0)).toBe(9);
    expect(summary.pillars.reduce((n, p) => n + p.met, 0)).toBe(summary.score);
    expect(summary.score).toBe(9);
  });

  it("reports every pillar in a fixed order, whatever the score", () => {
    for (const inputs of [allPass, allFail]) {
      const summary = toPublicScoreSummary(computeScore(inputs));
      expect(summary.pillars.map((p) => p.pillar)).toEqual(SCORE_PILLARS);
    }
  });

  it("earns nothing anywhere when nothing passes", () => {
    const summary = toPublicScoreSummary(computeScore(allFail));

    expect(summary.score).toBe(0);
    expect(summary.pillars.every((p) => p.met === 0)).toBe(true);
    // The totals are a property of the model, not of the result: an empty
    // score still says how many points were available in each pillar.
    expect(summary.pillars.reduce((n, p) => n + p.total, 0)).toBe(9);
  });

  it("notes a capped state without inflating a pillar", () => {
    // Seven context criteria pass with no armed pattern, which holds the state
    // at Watch and appends an unscored item explaining it.
    const decision = computeScore({ ...allPass, pattern: null });
    const summary = toPublicScoreSummary(decision);

    expect(decision.breakdown.length).toBeGreaterThan(9);
    expect(summary.max).toBe(9);
    expect(summary.stateNote).not.toBeNull();
  });

  it("notes the downgrade of an unconfirmed reversal", () => {
    const decision = applyReversionConfirmation(computeScore(allPass), pattern, false, false);
    expect(toPublicScoreSummary(decision).stateNote).not.toBeNull();
  });

  it("leaves the note off when the state matches the score", () => {
    expect(toPublicScoreSummary(computeScore(allPass)).stateNote).toBeNull();
    expect(toPublicScoreSummary(computeScore(allFail)).stateNote).toBeNull();
  });

  it("survives a decision with no breakdown at all", () => {
    const empty: ScanDecision = { score: 0, outputState: "Reject", breakdown: [] };
    const summary = toPublicScoreSummary(empty);

    expect(summary.pillars).toEqual([]);
    expect(summary.max).toBe(0);
  });
});

describe("redaction at the API boundary", () => {
  const decision = computeScore(allPass);

  it("replaces the breakdown with the summary", () => {
    const redacted = redactDecision(decision);

    expect(redacted.breakdown).toEqual([]);
    expect(redacted.summary?.score).toBe(decision.score);
    expect(redacted.score).toBe(decision.score);
    expect(redacted.outputState).toBe(decision.outputState);
  });

  it("carries no criterion or note text into the serialised response", () => {
    const serialised = JSON.stringify(redactDecision(decision));

    for (const item of decision.breakdown) {
      expect(serialised).not.toContain(item.criterion);
      expect(serialised).not.toContain(item.note);
    }
  });

  it("leaves the rest of the scan result untouched", () => {
    const result: ScanResult = {
      symbol: "AAPL",
      assetClass: "us_equity",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels,
      decision,
    };

    const redacted = redactScanResult(result);

    expect(redacted.levels).toEqual(result.levels);
    expect(redacted.pattern).toEqual(result.pattern);
    expect(redacted.gann).toEqual(result.gann);
    expect(redacted.decision.breakdown).toEqual([]);
    // The caller's own copy keeps its breakdown — the scan pipeline, the
    // backtest replay and the published rows all still read it server-side.
    expect(result.decision.breakdown).toHaveLength(9);
  });
});
