/**
 * What the protocol signal card is allowed to say about a score.
 *
 * The card used to print the scoring model verbatim: every criterion, its
 * verdict and the note explaining the threshold it tested. That is the
 * product. It now shows the pillar rollup instead — enough to see where a
 * score came from, not enough to reconstruct what earns one.
 *
 * `/api/scan` strips the breakdown before it reaches a browser
 * (lib/scoring/public-summary.ts), so in production the card never holds one.
 * These tests hand it one anyway: the rendering must not depend on the
 * boundary having done its job.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalCard } from "./signal-card";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";
import type { ScanResult, TrendReading } from "@/lib/types";

const trend = (direction: TrendReading["direction"]): TrendReading => ({
  timeframe: "1Day",
  direction,
  support: [90],
  resistance: [110],
});

const inputs: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bearish"), trend("bearish"), trend("bullish")],
  hourlyTrend: trend("bullish"),
  gann: {
    fanLines: [{ angle: "1x4 (high)", price: 101, distancePct: 0.4, role: "resistance" }],
    squareOf9: [],
    timeCycleActive: false,
    timeCycleDates: [],
  },
  nearSupportResistance: true,
  pattern: {
    name: "2-2",
    direction: "bullish",
    triggerPrice: 100,
    stopPrice: 95,
    description: "Test setup",
  },
  momentumElevated: true,
  levels: {
    entry: 100,
    stopLoss: 88,
    takeProfit1: 124,
    takeProfit2: 136,
    masterProfit: 136,
    riskPerShare: 12,
    rewardToRiskTp1: 2,
    rewardToRiskTp2: 3,
    rewardToRiskMaster: 3,
    masterFromStructure: false,
    stopPctOfPrice: 12,
    stopBandWarning: null,
  },
};

/** A result carrying the *unredacted* decision, as the scan pipeline builds it. */
function resultWithFullBreakdown(): ScanResult {
  const decision = computeScore(inputs);
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: "2026-08-08T15:33:00.000Z",
    currentPrice: 100,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: true,
    trends: [],
    gann: inputs.gann,
    pattern: inputs.pattern,
    armedPatterns: [inputs.pattern!],
    levels: inputs.levels,
    decision: { ...decision, summary: toPublicScoreSummary(decision) },
  };
}

describe("SignalCard score breakdown", () => {
  it("prints no criterion or note from the scoring model", () => {
    const result = resultWithFullBreakdown();
    const { container } = render(<SignalCard result={result} />);
    const text = container.textContent ?? "";

    expect(result.decision.breakdown).toHaveLength(9);
    for (const item of result.decision.breakdown) {
      expect(text).not.toContain(item.criterion);
      expect(text).not.toContain(item.note);
    }
  });

  it("shows where the score came from, one line per pillar", () => {
    const result = resultWithFullBreakdown();
    render(<SignalCard result={result} />);

    expect(screen.getByText("Score breakdown")).toBeInTheDocument();
    for (const label of ["Trend", "Structure", "Setup", "Timing", "Risk/reward"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Structure is the three-point pillar; two of its three pass in this fixture.
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("says nothing about the score when no summary was attached", () => {
    const result = resultWithFullBreakdown();
    result.decision = { ...result.decision, summary: undefined };

    render(<SignalCard result={result} />);
    expect(screen.queryByText("Score breakdown")).not.toBeInTheDocument();
  });

  it("still shows the trade plan the card exists to carry", () => {
    render(<SignalCard result={resultWithFullBreakdown()} />);

    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("Stop loss")).toBeInTheDocument();
  });
});
