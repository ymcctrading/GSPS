import { describe, expect, it } from "vitest";
import { summarizeRiskBook } from "@/lib/risk/dashboard";
import { capitalPerShare } from "@/lib/risk/gannCapital";

describe("summarizeRiskBook", () => {
  const base = { cash: 90_000, unit: 100_000, profitCeiling: null };

  it("reads each stop's risk, the total, and a tenth of the unit as the most one trade may risk", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [{ symbol: "AAPL", side: "long", qty: 100, entry: 100, stop: 97, option: false }],
      resting: [],
    });
    expect(s.equity).toBe(100_000);
    expect(s.maxRiskPerTrade).toBe(10_000);
    expect(s.positions[0]).toMatchObject({ riskUsd: 300, riskPctOfUnit: 0.3, stopPastEntry: false });
    expect(s.openRiskUsd).toBe(300);
    expect(s.capitalHeld).toBeCloseTo(100 * capitalPerShare(100), 6);
  });

  it("counts a short against equity and its risk above the entry", () => {
    const s = summarizeRiskBook({
      cash: 105_000,
      unit: 100_000,
      profitCeiling: null,
      positions: [{ symbol: "TSLA", side: "short", qty: 10, entry: 500, stop: 515, option: false }],
      resting: [],
    });
    expect(s.equity).toBe(100_000);
    expect(s.positions[0].riskUsd).toBe(150);
  });

  it("shows a trailed stop past the entry as no risk, and a missing stop as unprotected, never as zero", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [
        { symbol: "MSFT", side: "long", qty: 10, entry: 400, stop: 410, option: false },
        { symbol: "NVDA", side: "long", qty: 10, entry: 100, stop: null, option: false },
      ],
      resting: [],
    });
    expect(s.positions[0]).toMatchObject({ riskUsd: 0, stopPastEntry: true });
    expect(s.positions[1]).toMatchObject({ riskUsd: null, riskPctOfUnit: null });
    expect(s.unprotected).toBe(1);
  });

  it("counts resting entries in the markets and the capital held, as placement does", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [{ symbol: "AAPL", side: "long", qty: 10, entry: 100, stop: 97, option: false }],
      resting: [{ symbol: "BTC/USD", side: "buy", qty: 1, price: 60_000, stop: 58_000 }],
    });
    expect(s.markets).toMatchObject({ stocks: 1, other: 1, maxStocks: 5, maxOther: 3 });
    expect(s.positions[1]).toMatchObject({ resting: true, side: "long", riskUsd: 2_000 });
  });

  it("leaves option contracts out of the share and market counts", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [{ symbol: "AAPL261120C00200000", side: "long", qty: 1, entry: 5, stop: null, option: true }],
      resting: [],
    });
    expect(s.capitalHeld).toBe(0);
    expect(s.markets.stocks).toBe(0);
  });

  it("names the profit ceiling when it is the tighter of the two", () => {
    const s = summarizeRiskBook({ ...base, profitCeiling: 4_000, positions: [], resting: [] });
    expect(s.maxRiskPerTrade).toBe(4_000);
    expect(s.profitCeilingGoverns).toBe(true);
  });
});
