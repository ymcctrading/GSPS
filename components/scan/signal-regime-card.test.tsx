/**
 * The Signal and Regime Engine's own card: renders only the redacted rollup
 * (score/tier/tradeable/plan) — never a per-criterion breakdown note, and
 * never merges its four states into one verdict.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalRegimeCard } from "./signal-regime-card";
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

describe("SignalRegimeCard", () => {
  it("renders nothing when the scan has no signals field", () => {
    const { container } = render(<SignalRegimeCard result={{ ...baseResult, signals: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the regime, each state's tier, and a tradeable plan's levels", () => {
    const result: ScanResult = {
      ...baseResult,
      signals: {
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        trendPullback: {
          status: "evaluated",
          state: "trendPullback",
          regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
          alignment: { score: 88, tier: "aTier", breakdown: [] },
          tradeable: true,
          plan: {
            direction: "bullish",
            entryTrigger: 101.5,
            entryDescription: "x",
            stop: 98,
            target: 110,
            targetDescription: "y",
          },
          expiresAfterBars: 5,
          accountContextAssumed: true,
        },
        trendBreakout: null,
        confirmedReversal: {
          status: "disqualified",
          state: "confirmedReversal",
          disqualifiers: [{ key: "staleData", reason: "Market data is stale." }],
        },
        rangeReversion: { status: "notImplemented", state: "rangeReversion", reason: "n/a" },
      },
    };

    render(<SignalRegimeCard result={result} />);

    expect(screen.getByText("Signal & Regime Engine")).toBeInTheDocument();
    expect(screen.getByText("Trend · bullish")).toBeInTheDocument();
    expect(screen.getByText("Trend Pullback")).toBeInTheDocument();
    expect(screen.getByText("Tradeable")).toBeInTheDocument();
    expect(screen.getByText("A-tier")).toBeInTheDocument();
    expect(screen.getByText("$101.50")).toBeInTheDocument();
    expect(screen.getByText("$98.00")).toBeInTheDocument();
    expect(screen.getByText("$110.00")).toBeInTheDocument();
    expect(screen.getByText("Market data is stale.")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("never renders a per-criterion breakdown note", () => {
    const secretNote = "Relative volume 1.32x confirms real participation behind the reversal.";
    const result: ScanResult = {
      ...baseResult,
      signals: {
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        trendPullback: {
          status: "evaluated",
          state: "trendPullback",
          regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
          alignment: {
            score: 60,
            tier: "watchlistOnly",
            // A real /api/scan response never carries this — redactScanResult
            // strips it — but the card must not depend on that having happened.
            breakdown: [
              { key: "volumeResumption", label: "Volume", points: 10, maxPoints: 10, applicable: true, passed: true, note: secretNote },
            ],
          },
          tradeable: false,
          plan: null,
          expiresAfterBars: 5,
          accountContextAssumed: true,
        },
        trendBreakout: null,
        confirmedReversal: null,
        rangeReversion: null,
      },
    };

    render(<SignalRegimeCard result={result} />);

    expect(screen.queryByText(secretNote)).not.toBeInTheDocument();
  });
});
