/**
 * The Signal Engine column is a separate read from the score/verdict
 * columns beside it — never merged into them, and gracefully absent for
 * rows that don't carry one (a persisted daily_scans row).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsTable, type ScanRow } from "./results-table";

vi.mock("@/lib/hooks/useLiveQuote", () => ({
  useLiveQuote: (symbol: string | null) => {
    if (symbol === "DEAD") return { price: 90, symbol: "DEAD" };
    return null;
  },
}));

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
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
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

  it("shows the current price when a row carries one", () => {
    render(<ResultsTable rows={[{ ...BASE_ROW, currentPrice: 101.5 }]} />);
    expect(screen.getByText("$101.50")).toBeInTheDocument();
  });

  it("shows a dash for the price when a row carries none", () => {
    render(<ResultsTable rows={[BASE_ROW]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("drops a setup whose stop has already been broken into a separate group below the live ones", async () => {
    render(
      <ResultsTable
        rows={[
          { ...BASE_ROW, symbol: "LIVE", entry: 100, stopLoss: 95 },
          { ...BASE_ROW, symbol: "DEAD", entry: 100, stopLoss: 95 },
        ]}
      />,
    );

    // DEAD's mocked live quote (90) has already fallen through its 95 stop.
    expect(await screen.findByText("No longer valid — price already broke the stop")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const liveIndex = rows.findIndex((r) => r.textContent?.includes("LIVE"));
    const dividerIndex = rows.findIndex((r) => r.textContent?.includes("No longer valid"));
    const deadIndex = rows.findIndex((r) => r.textContent?.includes("DEAD"));
    expect(liveIndex).toBeLessThan(dividerIndex);
    expect(dividerIndex).toBeLessThan(deadIndex);
  });
});
