/**
 * A setup's row carries the levels; its name opens the setup card. The Signal
 * Engine read lives on that card as a separate read from the score/verdict
 * beside it — never merged into them, and gracefully absent for rows that don't
 * carry one (a persisted daily_scans row).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsTable, type ScanRow } from "./results-table";

let flappyPrice: number | null = null;

vi.mock("@/lib/hooks/useLiveQuote", () => ({
  useLiveQuote: (symbol: string | null) => {
    if (symbol === "DEAD") return { price: 90, symbol: "DEAD" };
    if (symbol === "FLAPPY") return flappyPrice == null ? null : { price: flappyPrice, symbol: "FLAPPY" };
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
  beforeEach(() => {
    flappyPrice = null;
  });

  it("lists the levels in the order name, price, entry, exit, TP1, MTP", () => {
    render(<ResultsTable rows={[{ ...BASE_ROW, currentPrice: 101.5 }]} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(0, 6)).toEqual(["Symbol", "Price", "Entry", "Exit (S/L)", "TP1", "MTP"]);
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$95.00")).toBeInTheDocument();
    expect(screen.getByText("$110.00")).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();
  });

  it("opens a card halfway from the name — the score and a short synopsis — then expands and collapses", async () => {
    const user = userEvent.setup();
    render(
      <ResultsTable
        rows={[
          {
            ...BASE_ROW,
            scoreSummary: {
              score: 8,
              max: 9,
              stateNote: null,
              pillars: [
                { pillar: "trend", met: 2, total: 2 },
                { pillar: "structure", met: 2, total: 3 },
                { pillar: "timing", met: 0, total: 1 },
              ],
            },
            trends: [
              { timeframe: "1Month", direction: "bullish" },
              { timeframe: "1Day", direction: "bearish" },
            ],
          },
        ]}
      />,
    );

    const name = screen.getByRole("button", { name: "AAPL" });
    expect(name).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/A buy setup ready to act on/)).not.toBeInTheDocument();

    await user.click(name);
    expect(name).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Execute")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A buy setup ready to act on: 8 of 9 checks line up, strongest on trend, still missing timing. Enter near $100.00, exit at $95.00 if it fails, first target $110.00 (2.0× the risk).",
      ),
    ).toBeInTheDocument();
    // Halfway: the detail waits behind the expand control.
    expect(screen.queryByText("What lined up")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the full scan for AAPL" })).toHaveAttribute("href", "/ticker/AAPL");

    await user.click(screen.getByRole("button", { name: /Show the full card/ }));
    expect(screen.getByText("What lined up")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
    expect(screen.getByText("Timing")).toBeInTheDocument();
    expect(screen.getByText("Higher timeframes: Monthly rising, Daily falling.")).toBeInTheDocument();
    expect(screen.getByText("MTP", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText("Exit (S/L)", { selector: "dt" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByText("What lined up")).not.toBeInTheDocument();
    expect(screen.getByText(/A buy setup ready to act on/)).toBeInTheDocument();

    await user.click(name);
    expect(screen.queryByText(/A buy setup ready to act on/)).not.toBeInTheDocument();
  });

  it("still opens a card, with the score and the plan, for a row that carries no rollup", async () => {
    const user = userEvent.setup();
    render(<ResultsTable rows={[BASE_ROW]} />);

    await user.click(screen.getByRole("button", { name: "AAPL" }));
    expect(screen.getByText(/A buy setup ready to act on: 8 of 9 checks line up\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show the full card/ }));
    expect(screen.queryByText("What lined up")).not.toBeInTheDocument();
  });

  it("shows the Rules Alignment score and the Signal Engine read on the card, separate from the score", async () => {
    const user = userEvent.setup();
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
              alignmentScore: 82,
              tradeable: true,
              accountContextAssumed: true,
            },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "AAPL" }));
    expect(screen.getByText(/Rules alignment 82\/100 \(A-tier\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show the full card/ }));
    expect(screen.getByText("Trend Pullback")).toBeInTheDocument();
    expect(screen.getAllByText("A-tier").length).toBeGreaterThan(0);
  });

  it("never lets a watchlist-only, non-tradeable rollup read as an executable score", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "AAPL" }));
    await user.click(screen.getByRole("button", { name: /Show the full card/ }));
    expect(screen.getByText("Watchlist")).toBeInTheDocument();
    expect(screen.getByText("Range Reversion")).toBeInTheDocument();
    expect(screen.getByText(/A buy setup not yet strong enough to act on/)).toBeInTheDocument();
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

  it("keeps a row invalidated once its live quote breaks the stop, even after the quote goes back to unknown", async () => {
    flappyPrice = null;
    const { rerender } = render(
      <ResultsTable rows={[{ ...BASE_ROW, symbol: "FLAPPY", entry: 100, stopLoss: 95 }]} />,
    );

    // No quote yet — nothing invalidated.
    expect(screen.queryByText("No longer valid — price already broke the stop")).not.toBeInTheDocument();

    // Quote lands, breaks the stop.
    flappyPrice = 90;
    rerender(<ResultsTable rows={[{ ...BASE_ROW, symbol: "FLAPPY", entry: 100, stopLoss: 95 }]} />);
    expect(await screen.findByText("No longer valid — price already broke the stop")).toBeInTheDocument();

    // The shared poller drops back to unknown (a resubscribe, a rate-limit
    // backoff) — this must not un-invalidate the row.
    flappyPrice = null;
    rerender(<ResultsTable rows={[{ ...BASE_ROW, symbol: "FLAPPY", entry: 100, stopLoss: 95 }]} />);
    expect(screen.getByText("No longer valid — price already broke the stop")).toBeInTheDocument();
  });
});
