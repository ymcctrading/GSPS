import { describe, expect, it } from "vitest";
import { openLegOf, summarizeRiskBook, type RiskBookInput } from "@/lib/risk/dashboard";
import { capitalPerShare } from "@/lib/risk/gannCapital";

type Pos = RiskBookInput["positions"][number];
const pos = (p: Partial<Pos> & Pick<Pos, "symbol">): Pos => ({
  side: "long", qty: 100, entry: 100, openingStop: null, option: false, legs: [], ...p,
});

describe("summarizeRiskBook", () => {
  const base = { cash: 90_000, unit: 100_000, profitCeiling: null, resting: [] };

  it("reads risk from the working plan's stop, the total, and a tenth of the unit as the most one trade may risk", () => {
    const s = summarizeRiskBook({ ...base, positions: [pos({ symbol: "AAPL", legs: [{ qty: 100, entry: 100, stop: 97 }] })] });
    expect(s.equity).toBe(100_000);
    expect(s.maxRiskPerTrade).toBe(10_000);
    expect(s.maxRiskSetBy).toBe("unit");
    expect(s.positions[0]).toMatchObject({ riskUsd: 300, riskPctOfUnit: 0.3, stopPastEntry: false, unprotectedQty: 0 });
    expect(s.openRiskUsd).toBe(300);
    expect(s.capitalHeld).toBeCloseTo(100 * capitalPerShare(100), 6);
  });

  it("counts a short against equity and its risk above its entry", () => {
    const s = summarizeRiskBook({
      ...base,
      cash: 105_000,
      positions: [pos({ symbol: "TSLA", side: "short", qty: 10, entry: 500, legs: [{ qty: 10, entry: 500, stop: 515 }] })],
    });
    expect(s.equity).toBe(100_000);
    expect(s.positions[0].riskUsd).toBe(150);
  });

  it("prices each add on its own entry and trailed stop, as the exit manager does", () => {
    // 100 at 50 with the stop trailed to 55, then 100 more at 60 stopped at 57.
    const s = summarizeRiskBook({
      ...base,
      positions: [pos({ symbol: "XYZ", qty: 200, entry: 55, legs: [{ qty: 100, entry: 50, stop: 55 }, { qty: 100, entry: 60, stop: 57 }] })],
    });
    expect(s.positions[0]).toMatchObject({ riskUsd: 300, stops: [55, 57], stopPastEntry: false, unprotectedQty: 0 });
  });

  it("shows shares no working plan covers as unprotected, even when the position has an opening stop", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [
        pos({ symbol: "NVDA", qty: 10, openingStop: 95 }),
        pos({ symbol: "AMD", qty: 30, legs: [{ qty: 10, entry: 100, stop: 97 }] }),
      ],
    });
    expect(s.positions[0]).toMatchObject({ riskUsd: null, unprotectedQty: 10 });
    expect(s.positions[1]).toMatchObject({ riskUsd: 30, unprotectedQty: 20 });
    expect(s.unprotected).toBe(2);
  });

  it("prices the risk on the shares held when a plain sell shrank a plan-managed position", () => {
    // A 100-share plan, then 60 sold through the ticket: 40 held, tranches still open.
    const s = summarizeRiskBook({ ...base, positions: [pos({ symbol: "QQQ", qty: 40, legs: [{ qty: 100, entry: 100, stop: 97 }] })] });
    expect(s.positions[0]).toMatchObject({ riskUsd: 120, unprotectedQty: 0 });
  });

  it("shows a stop trailed past the entry as no risk", () => {
    const s = summarizeRiskBook({ ...base, positions: [pos({ symbol: "MSFT", qty: 10, entry: 400, legs: [{ qty: 10, entry: 400, stop: 410 }] })] });
    expect(s.positions[0]).toMatchObject({ riskUsd: 0, stopPastEntry: true });
  });

  it("counts resting entries in the markets and the capital held, as placement does", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [pos({ symbol: "AAPL", qty: 10, legs: [{ qty: 10, entry: 100, stop: 97 }] })],
      resting: [{ symbol: "BTC/USD", side: "buy", qty: 1, price: 60_000, stop: 58_000 }],
    });
    expect(s.markets).toMatchObject({ stocks: 1, other: 1, maxStocks: 5, maxOther: 3 });
    expect(s.positions[1]).toMatchObject({ resting: true, side: "long", riskUsd: 2_000 });
  });

  it("counts a bought option's premium as its risk, outside the share and market counts", () => {
    const s = summarizeRiskBook({ ...base, positions: [pos({ symbol: "AAPL261120C00200000", qty: 2, entry: 5, option: true })] });
    expect(s.positions[0]).toMatchObject({ riskUsd: 1_000, unprotectedQty: 0 });
    expect(s.unprotected).toBe(0);
    expect(s.capitalHeld).toBe(0);
    expect(s.markets.stocks).toBe(0);
  });

  it("names the profit ceiling when it is the tighter of the two", () => {
    const s = summarizeRiskBook({ ...base, profitCeiling: 4_000, positions: [] });
    expect(s.maxRiskPerTrade).toBe(4_000);
    expect(s.maxRiskSetBy).toBe("profits");
  });

  it("shows Novice's guard rails as placement reads them, open risk from the opening stop", () => {
    const s = summarizeRiskBook({
      ...base,
      positions: [pos({ symbol: "AAPL", qty: 100, entry: 100, openingStop: 95, legs: [{ qty: 100, entry: 100, stop: 99 }] })],
      noviceCeilings: { maxGroups: 1 },
    });
    // Equity $100k: 2% is $2,000, less $500 to the opening stop.
    expect(s.novice).toEqual({ maxPositionUsd: 25_000, deployedRoomUsd: 55_000, openRiskRoomUsd: 1_500, symbolsOpen: 1, maxSymbols: 1 });
    expect(s.maxRiskPerTrade).toBe(1_500);
    expect(s.maxRiskSetBy).toBe("novice_open_risk");
  });

  it("never shows NaN when an entry can't be read", () => {
    const s = summarizeRiskBook({ ...base, positions: [pos({ symbol: "X", legs: [{ qty: 10, entry: Number.NaN, stop: 9 }] })] });
    expect(Number.isFinite(s.openRiskUsd)).toBe(true);
    expect(s.positions[0].unprotectedQty).toBe(100);
  });
});

describe("openLegOf", () => {
  const row = {
    symbol: "AAPL", side: "long", entry_price: "100", stop_loss: "95", applied_stop: null,
    scale_out_qty: 60, master_qty: 0, runner_qty: 40, scale_out_order_id: null, master_order_id: null, runner_order_id: null,
  };
  it("counts only tranches with no exit order yet, at the trailed stop when there is one", () => {
    expect(openLegOf(row)).toEqual({ qty: 100, entry: 100, stop: 95 });
    expect(openLegOf({ ...row, scale_out_order_id: "o1", applied_stop: "101" })).toEqual({ qty: 40, entry: 100, stop: 101 });
  });
  it("is nothing once every tranche has left", () => {
    expect(openLegOf({ ...row, scale_out_order_id: "o1", runner_order_id: "o2" })).toBeNull();
  });
});
