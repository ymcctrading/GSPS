/**
 * The Risk card (review of #415): a row is flagged against rule 1's tenth,
 * never against Novice's room for the next trade, and the card reads the
 * book again when the Portfolio page moves its refresh key.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskPanel } from "../risk-panel";

const row = (symbol: string, risk: number) => ({
  symbol, side: "long", qty: 100, entry: 100, stops: [91], stopPastEntry: false, unprotectedQty: 0,
  riskUsd: risk, riskPctOfUnit: risk / 1000, largestTradeRiskUsd: risk, resting: false, option: false,
});

const book = {
  equity: 100_000, unit: 100_000, maxRiskPerTrade: 200, maxRiskSetBy: "novice_open_risk", tenthPerTrade: 10_000,
  capitalHeld: 0, capitalRoom: 100_000,
  markets: { stocks: 2, maxStocks: 5, other: 0, maxOther: 3 },
  openRiskUsd: 1_800, openRiskPctOfUnit: 1.8, restingRiskUsd: 0, premiumRiskUsd: 0, unprotected: 0,
  novice: { maxPositionUsd: 25_000, deployedRoomUsd: 45_000, openRiskRoomUsd: 200, symbolsOpen: 2, maxSymbols: "unlimited" },
  positions: [row("AAPL", 900), row("MSFT", 12_000)],
  lossSeries: { consecutiveLosses: 0, paused: false, note: null },
  drawdown30dPct: null,
};

function mockFetch() {
  const fn = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(book) } as Response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("RiskPanel", () => {
  it("flags a trade over the tenth, not one over Novice's remaining room", async () => {
    mockFetch();
    render(<RiskPanel />);
    const ok = await screen.findByText("$900.00");
    expect(ok.className).not.toMatch(/text-bear/);
    expect(screen.getByText("$12,000.00").className).toMatch(/text-bear/);
  });

  it("reads the book again when the refresh key moves", async () => {
    const fn = mockFetch();
    const { rerender } = render(<RiskPanel refreshKey={{ a: 0 }} />);
    await screen.findByText("$900.00");
    rerender(<RiskPanel refreshKey={{ a: 1 }} />);
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });
});
