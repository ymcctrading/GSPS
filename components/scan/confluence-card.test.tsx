/**
 * Gann Confluence Layer / Sara Sniper Strat Confluence Layer card — renders
 * the three-way framework identity and each module's alignment read, never a
 * per-criterion explanation-trace note.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfluenceCard } from "./confluence-card";
import type { ScanResult } from "@/lib/types";

const baseResult: Omit<ScanResult, "signals"> = {
  symbol: "AAPL",
  assetClass: "us_equity",
  scannedAt: "2026-08-08T00:00:00Z",
  currentPrice: 100,
  direction: "bullish",
  setupKind: "reversion",
  momentumElevated: true,
  trends: [],
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
  pattern: null,
  armedPatterns: [],
  levels: null,
  decision: { score: 0, outputState: "Reject", breakdown: [] },
};

const baseSignals = {
  regime: { regime: "trend" as const, direction: "bullish" as const, reasons: [], disqualifiers: [] },
  trendPullback: null,
  trendBreakout: null,
  confirmedReversal: null,
  rangeReversion: null,
};

describe("ConfluenceCard", () => {
  it("renders nothing when the scan has no signals field", () => {
    const { container } = render(<ConfluenceCard result={{ ...baseResult, signals: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when both confluence modules are disabled (null)", () => {
    const { container } = render(
      <ConfluenceCard
        result={{ ...baseResult, signals: { ...baseSignals, gannConfluence: null, saraConfluence: null } }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the Gann and Sara alignment badges and the framework identity", () => {
    const result: ScanResult = {
      ...baseResult,
      signals: {
        ...baseSignals,
        gannConfluence: {
          module: {
            moduleId: "gann_confluence_layer",
            moduleType: "gann",
            displayName: "Gann Confluence Layer",
            authorizedSource: "lib/gann",
            version: "0.1.0",
          },
          market: "equities",
          marketAdapterStatus: "supported",
          alignment: "aligned",
          root: 10.1,
          nearestSquareOf9: { degree: 0, price: 105, distancePct: 1, rotation: 0, role: "support" },
          nearestFanLine: null,
          timeCycleActive: false,
          timeCycleDates: [],
          materialNumberClassification: "notImplemented",
          evidence: { calculationVersion: "0.1.0", inputs: { secretNote: "internal threshold" }, sourceTimestamp: "x", explanationTrace: ["secret internal trace"] },
          note: "Confluence only.",
        },
        saraConfluence: {
          module: {
            moduleId: "sara_sniper_confluence_layer",
            moduleType: "sara",
            displayName: "Sara Sniper Strat Confluence Layer",
            authorizedSource: "lib/strat/patterns.ts",
            version: "0.1.0",
          },
          market: "equities",
          marketAdapterStatus: "supported",
          alignment: "conflict",
          scenarioId: "2-1-2",
          direction: "bullish",
          timeframeContinuity: "notConfirmed",
          confirmationState: "closedBarConfirmed",
          evidence: { calculationVersion: "0.1.0", inputs: {}, sourceTimestamp: "x", explanationTrace: ["secret internal trace"] },
          note: "Confluence factor only.",
        },
      },
    };

    render(<ConfluenceCard result={result} />);

    expect(screen.getByText("Gann & Sara Confluence")).toBeInTheDocument();
    expect(screen.getByText("Gann Confluence Layer")).toBeInTheDocument();
    expect(screen.getByText("Sara Sniper Strat Confluence Layer")).toBeInTheDocument();
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(screen.getByText("Conflict")).toBeInTheDocument();
    expect(screen.queryByText("secret internal trace")).not.toBeInTheDocument();
  });
});
