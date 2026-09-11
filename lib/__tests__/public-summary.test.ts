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
import { DEFAULT_CRITERION_WEIGHTS } from "@/lib/scoring/weights";
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

// direction below is "bullish" (a long), so every level here is a support
// floor underneath price — the side that actually confirms a long — not a
// resistance ceiling overhead.
const gann: GannLevels = {
  fanLines: [],
  squareOf9: [{ degree: 45, price: 100.5, distancePct: 0.2, role: "support" }],
  timeCycleActive: true,
  timeCycleBullishActive: true,
  timeCycleBearishActive: false,
  timeCycleDates: ["2026-08-06"],
  angleSlopes: [
    { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
  ],
  retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100.5, distancePct: 0.2, role: "support" }],
  digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
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
  // Macro trend now scores agreement with the trade, not the old
  // counter-trend-into-a-level premise.
  macroTrends: [trend("bullish"), trend("bullish"), trend("bullish")],
  hourlyTrend: trend("bullish"),
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
};

const allFail: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bearish"), trend("bearish"), trend("bearish")],
  hourlyTrend: trend("bearish"),
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
  nearSupportResistance: false,
  pattern: null,
  momentumElevated: false,
  stopAtrMultiple: 0.8,
  levels: null,
};

describe("toPublicScoreSummary", () => {
  it("accounts for every scored criterion exactly once", () => {
    const summary = toPublicScoreSummary(computeScore(allPass));

    // Pillar `met`/`total` are raw criterion counts (a checklist: how many of
    // this pillar's conditions held), not weighted points — see this file's
    // header and the dot-indicator UI (SignalCard/GuidedCard) that renders
    // them as small fixed slot counts. That count is a property of the model
    // (nine criteria, always) and does not move when a criterion's weight
    // does, so it stays 9 regardless of DEFAULT_CRITERION_WEIGHTS.
    expect(summary.max).toBe(9);
    expect(summary.pillars.reduce((n, p) => n + p.total, 0)).toBe(9);
    // A full pass means every pillar fully held, not that the met-count sum
    // equals the headline score — those are different scales once weights
    // aren't uniform (two criteria are down-weighted; see
    // DEFAULT_CRITERION_WEIGHTS's own doc comment), and equating them was
    // only ever an accident of every weight being 1.
    expect(summary.pillars.every((p) => p.met === p.total)).toBe(true);
    const totalDefaultWeight =
      Math.round(Object.values(DEFAULT_CRITERION_WEIGHTS).reduce((sum, w) => sum + w, 0) * 100) / 100;
    expect(summary.score).toBe(totalDefaultWeight);
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

  it("redacts the Signal and Regime Engine's per-criterion breakdown the same way", () => {
    const secretNote = "Relative volume 1.32x confirms real participation behind the reversal.";
    const secretThreshold = "ADX 24.3 supports trend strength (>= 20)";
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
      signals: {
        regime: { regime: "trend", direction: "bullish", reasons: [secretThreshold], disqualifiers: [] },
        trendPullback: {
          status: "evaluated",
          state: "trendPullback",
          regime: { regime: "trend", direction: "bullish", reasons: [secretThreshold], disqualifiers: [] },
          alignment: {
            score: 88,
            tier: "aTier",
            blueprintScoreBand: "HIGH_CONFLUENCE",
            breakdown: [
              { key: "volumeResumption", label: "Volume", points: 10, maxPoints: 10, applicable: true, passed: true, note: secretNote },
            ],
          },
          tradeable: true,
          plan: { direction: "bullish", entryTrigger: 101, entryDescription: "x", stop: 99, target: 105, targetDescription: "y" },
          expiresAfterBars: 5,
          accountContextAssumed: true,
        },
        trendBreakout: null,
        confirmedReversal: null,
        rangeReversion: null,
        gannConfluence: null,
        saraConfluence: null,
      },
    };

    const redacted = redactScanResult(result);
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain(secretNote);
    expect(serialised).not.toContain(secretThreshold);
    // The rollup a reader needs survives.
    expect(redacted.signals?.trendPullback?.status).toBe("evaluated");
    if (redacted.signals?.trendPullback?.status === "evaluated") {
      expect(redacted.signals.trendPullback.alignment.score).toBe(88);
      expect(redacted.signals.trendPullback.alignment.tier).toBe("aTier");
      expect(redacted.signals.trendPullback.tradeable).toBe(true);
      expect(redacted.signals.trendPullback.plan?.entryTrigger).toBe(101);
    }
    // The caller's own copy keeps its breakdown server-side.
    if (result.signals?.trendPullback?.status === "evaluated") {
      expect(result.signals.trendPullback.alignment.breakdown).toHaveLength(1);
    }
  });
});
