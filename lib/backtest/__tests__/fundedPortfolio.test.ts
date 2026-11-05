/**
 * The funded lot-level ledger's fixture tests (edge isolation handoff, Part
 * 11): cash debits and credits, every lot marked, the ledger reconciles,
 * nothing is sized on a close it couldn't have seen, same-session exits fund
 * nothing, adds can't bypass funding or the gross cap, every share pays its
 * cost, missing prices make no return, and the drawdown spans are named.
 */
import { describe, expect, it } from "vitest";
import { drawdownStats, simulateFundedPortfolio, type FundedTrade } from "@/lib/backtest/fundedPortfolio";

const day = (d: string) => `${d}T05:00:00Z`;
const series = (rows: Array<[string, number]>) => rows.map(([d, c]) => ({ t: day(d), c }));
const D = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08", "2024-01-09"];

function closes(map: Record<string, number[]>) {
  return new Map(Object.entries(map).map(([s, cs]) => [s, series(cs.map((c, k) => [D[k], c] as [string, number]))]));
}

const base = { startEquity: 10_000, riskFraction: 0.01, maxOpenRiskFraction: 1, maxConcurrent: 10, maxPositionFraction: 1, maxGrossExposure: 1, costPerShare: 0 };

describe("funded lot-level ledger", () => {
  it("debits cash on a purchase and credits the proceeds on the exit session", () => {
    // Risk $100 at $10 a share: 10 shares at $100.
    const t: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: day(D[2]), entry: 100, stop: 90, side: "long", exitPrice: 110 };
    const r = simulateFundedPortfolio([t], { ...base, closes: closes({ A: [102, 105, 111, 111, 111, 111] }) });
    expect(r.campaigns[0].firstShares).toBe(10);
    expect(r.curve[0].cash).toBeCloseTo(10_000 - 1_000, 9);
    expect(r.curve[0].equity).toBeCloseTo(10_000 + 20, 9);
    expect(r.curve[2].cash).toBeCloseTo(10_000 + 100, 9);
    expect(r.endEquity).toBeCloseTo(10_100, 9);
    expect(r.campaigns[0].pnl).toBeCloseTo(100, 9);
  });

  it("marks every lot, adds included, and reconciles cash with lots", () => {
    const t: FundedTrade = {
      symbol: "A", openedAt: day(D[0]), closedAt: null, entry: 100, stop: 90, side: "long",
      lotFills: [{ fraction: 1, fill: 100, at: day(D[0]) }, { fraction: 0.5, fill: 104, at: day(D[1]) }],
    };
    const r = simulateFundedPortfolio([t], { ...base, costPerShare: 0.02, closes: closes({ A: [100, 105, 110, 108, 108, 108] }) });
    expect(r.addsFilled).toBe(1);
    // 10 + 5 shares; on D[2] both lots are at 110.
    expect(r.curve[2].longValue).toBeCloseTo(15 * 110, 9);
    expect(r.curve[2].equity).toBeCloseTo(10_000 + 10 * 10 + 5 * 6 - 15 * 0.01, 9);
    expect(r.reconciliationError).toBeLessThan(1e-6);
    expect(r.campaigns[0].open).toBe(true);
  });

  it("sizes on the prior session's close, never on the entry session's own close", () => {
    const a: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: null, entry: 100, stop: 90, side: "long" };
    const b: FundedTrade = { symbol: "B", openedAt: day(D[1]), closedAt: null, entry: 50, stop: 45, side: "long" };
    const run = (bClose: number) =>
      simulateFundedPortfolio([a, b], { ...base, closes: closes({ A: [100, bClose, 100, 100, 100, 100], B: [50, 50, 50, 50, 50, 50] }) });
    // A's D[1] close swings equity on D[1]; B is sized on D[0]'s equity either way.
    expect(run(60).campaigns[1].firstShares).toBe(run(140).campaigns[1].firstShares);
    expect(run(60).campaigns[1].firstShares).toBe(Math.floor((10_000 * 0.01) / 5));
  });

  it("does not let a same-session exit fund that session's entry", () => {
    // A spends nearly all the cash; it exits on D[1], the same session B wants to buy.
    const a: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: day(D[1]), entry: 100, stop: 99, side: "long", exitPrice: 100 };
    const b: FundedTrade = { symbol: "B", openedAt: day(D[1]), closedAt: null, entry: 100, stop: 99, side: "long" };
    const r = simulateFundedPortfolio([a, b], { ...base, maxGrossExposure: 5, closes: closes({ A: [100, 100, 100, 100, 100, 100], B: [100, 100, 100, 100, 100, 100] }) });
    expect(r.campaigns[0].firstShares).toBe(100);
    expect(r.campaigns[1].accepted).toBe(false);
    expect(r.campaigns[1].reason).toBe("insufficient cash");
    expect(r.curve[1].cash).toBeCloseTo(10_000, 9);
  });

  it("trims an add to the cash on hand and skips one beyond the gross cap", () => {
    const t: FundedTrade = {
      symbol: "A", openedAt: day(D[0]), closedAt: null, entry: 100, stop: 98, side: "long",
      lotFills: [{ fraction: 1, fill: 100, at: day(D[0]) }, { fraction: 0.5, fill: 100, at: day(D[1]) }, { fraction: 0.5, fill: 100, at: day(D[2]) }],
    };
    // Risk sizing wants 50 shares ($5,000); the first add wants 25 more but only 25 fit in $10,000 of gross... then nothing.
    const r = simulateFundedPortfolio([t], { ...base, riskFraction: 0.01, closes: closes({ A: [100, 100, 100, 100, 100, 100] }) });
    expect(r.campaigns[0].firstShares).toBe(50);
    expect(r.addsFilled).toBe(2);
    const capped = simulateFundedPortfolio([t], { ...base, maxGrossExposure: 0.6, closes: closes({ A: [100, 100, 100, 100, 100, 100] }) });
    expect(capped.addsTrimmed).toBe(1);
    expect(capped.addsSkipped).toBe(1);
    expect(capped.maxGross).toBeLessThanOrEqual(0.6 + 1e-9);
    for (const pt of capped.curve) expect(pt.cash).toBeGreaterThanOrEqual(0);
  });

  it("charges the cost on every executed share, first lots and adds, both sides", () => {
    const t: FundedTrade = {
      symbol: "A", openedAt: day(D[0]), closedAt: day(D[3]), entry: 100, stop: 90, side: "long", exitPrice: 100,
      lotFills: [{ fraction: 1, fill: 100, at: day(D[0]) }, { fraction: 0.5, fill: 100, at: day(D[1]) }],
    };
    const r = simulateFundedPortfolio([t], { ...base, costPerShare: 0.04, closes: closes({ A: [100, 100, 100, 100, 100, 100] }) });
    expect(r.totalCosts).toBeCloseTo(15 * 0.04, 9);
    expect(r.endEquity).toBeCloseTo(10_000 - 15 * 0.04, 9);
  });

  it("keeps the last mark when a close is missing, and counts it", () => {
    const t: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: null, entry: 100, stop: 90, side: "long" };
    const gappy = new Map([
      ["A", series([[D[0], 100], [D[1], 105], [D[3], 107]])],
      ["Z", series(D.map((d) => [d, 1] as [string, number]))],
    ]);
    const r = simulateFundedPortfolio([t], { ...base, closes: gappy });
    expect(r.staleMarks).toBeGreaterThan(0);
    expect(r.curve[2].equity).toBeCloseTo(r.curve[1].equity, 9);
    expect(r.dailyReturns.every(Number.isFinite)).toBe(true);
  });

  it("reconciles the first day's return to the starting equity", () => {
    const t: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: null, entry: 100, stop: 90, side: "long" };
    const r = simulateFundedPortfolio([t], { ...base, closes: closes({ A: [103, 103, 103, 103, 103, 103] }) });
    expect(r.dailyReturns[0]).toBeCloseTo((10_000 + 30) / 10_000 - 1, 12);
  });

  it("books a short's proceeds as cash and its liability at the mark", () => {
    const t: FundedTrade = { symbol: "A", openedAt: day(D[0]), closedAt: day(D[2]), entry: 100, stop: 110, side: "short", exitPrice: 90 };
    const r = simulateFundedPortfolio([t], { ...base, closes: closes({ A: [95, 95, 90, 90, 90, 90] }) });
    expect(r.curve[0].shortLiability).toBeCloseTo(10 * 95, 9);
    expect(r.curve[0].equity).toBeCloseTo(10_000 + 50, 9);
    expect(r.endEquity).toBeCloseTo(10_100, 9);
    expect(r.reconciliationError).toBeLessThan(1e-6);
  });

  it("is reproducible, and a seeded order is a declared alternative to ledger order", () => {
    const ts: FundedTrade[] = ["A", "B", "C"].map((s) => ({ symbol: s, openedAt: day(D[0]), closedAt: null, entry: 100, stop: 90, side: "long" as const }));
    const cl = closes({ A: [100, 100, 100, 100, 100, 100], B: [100, 100, 100, 100, 100, 100], C: [100, 100, 100, 100, 100, 100] });
    const opts = { ...base, maxConcurrent: 1, closes: cl };
    expect(simulateFundedPortfolio(ts, opts).campaigns[0].accepted).toBe(true);
    const seeded = (seed: number) => simulateFundedPortfolio(ts, { ...opts, order: { seed } });
    expect(seeded(4)).toEqual(seeded(4));
    const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => seeded(s).campaigns.findIndex((c) => c.accepted)));
    expect(winners.size).toBeGreaterThan(1);
  });

  it("names the drawdown's peak-to-trough span apart from the longest underwater stretch", () => {
    const eq = [100, 120, 90, 100, 119, 121, 110].map((e, k) => ({ date: `d${k}`, equity: e }));
    const s = drawdownStats(eq, 100);
    expect(s.maxDrawdown).toBeCloseTo(0.25, 12);
    expect(s.peakToTroughSessions).toBe(1);
    expect(s.longestUnderwaterSessions).toBe(4);
    expect(s.recovered).toBe(false);
  });
});
