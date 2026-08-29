/**
 * The Signal Engine column is a separate read from the score/verdict
 * columns beside it — never merged into them, and gracefully absent for
 * rows that don't carry one (a persisted daily_scans row).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsTable, type ScanRow } from "./results-table";

const BASE_ROW: ScanRow = {
  symbol: "AAPL",
  score: 8,
  outputState: "Execute",
  direction: "bullish",
  entry: 100,
  stopLoss: 95,
  takeProfit1: 110,
  masterProfit: 120,
  patternName: "2-2",
  setupKind: "reversion",
};

describe("ResultsTable", () => {
  it("shows a dash in the Signal Engine column when a row carries no rollup", () => {
    render(<ResultsTable rows={[BASE_ROW]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the state, tier, and a tradeable indicator when a row carries a rollup", () => {
    render(
      <ResultsTable
        rows={[
          {
            ...BASE_ROW,
            signal: {
              state: "trendPullback",
              regime: "trend",
              direction: "bullish",
              tier: "aTier",
              tradeable: true,
              accountContextAssumed: true,
            },
          },
        ]}
      />,
    );
    expect(screen.getByText("Trend Pullback")).toBeInTheDocument();
    expect(screen.getByText("A-tier")).toBeInTheDocument();
  });

  it("never lets a watchlist-only, non-tradeable rollup read as an executable score", () => {
    render(
      <ResultsTable
        rows={[
          {
            ...BASE_ROW,
            outputState: "Reject",
            score: 2,
            signal: {
              state: "rangeReversion",
              regime: "range",
              direction: "sideways",
              tier: "watchlistOnly",
              tradeable: false,
              accountContextAssumed: false,
            },
          },
        ]}
      />,
    );
    expect(screen.getByText("Watchlist")).toBeInTheDocument();
    expect(screen.getByText("Range Reversion")).toBeInTheDocument();
  });
});
