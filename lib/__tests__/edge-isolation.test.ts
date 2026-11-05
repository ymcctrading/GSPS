/** The edge-isolation runner's arguments and its SPY buy-and-hold (E6). */
import { describe, expect, it } from "vitest";
import { parseArgs, spyBuyAndHold } from "../../scripts/edge-isolation.mjs";

const ts = (d: string) => Date.parse(`${d}T14:30:00Z`) / 1000;
function yahoo(rows: Array<[string, number, number]>, divs: Array<[string, number]> = []) {
  return {
    chart: {
      result: [{
        meta: { exchangeTimezoneName: "America/New_York" },
        timestamp: rows.map(([d]) => ts(d)),
        indicators: { quote: [{ open: rows.map((r) => r[1]), close: rows.map((r) => r[2]) }] },
        events: { dividends: Object.fromEntries(divs.map(([d, a]) => [String(ts(d)), { date: ts(d), amount: a }])) },
      }],
    },
  };
}

describe("edge-isolation runner", () => {
  it("requires its inputs and rejects an unknown experiment", () => {
    expect(() => parseArgs([])).toThrow();
    const base = ["--ledger", "l", "--barCache", "c", "--since", "2020-10-30", "--out", "o"];
    expect(parseArgs(base).only).toContain("e6");
    expect(() => parseArgs([...base, "--only", "e9"])).toThrow();
    expect(() => parseArgs([...base, "--draws", "0"])).toThrow();
  });

  it("buys SPY once at the first session's open and holds on exactly the strategy's dates", () => {
    const doc = yahoo([["2024-01-02", 100, 101], ["2024-01-03", 101, 102], ["2024-01-04", 102, 100]]);
    const r = spyBuyAndHold(doc, ["2024-01-02", "2024-01-03", "2024-01-04"], { startEquity: 10_000, costPerShare: 0.02 });
    expect(r.shares).toBe(99);
    expect(r.curve.map((p: { date: string }) => p.date)).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(r.curve[2].equity).toBeCloseTo(10_000 - 99 * 100.01 + 99 * 100, 9);
  });

  it("credits dividends on the ex-date and reinvests them only when asked", () => {
    const doc = yahoo([["2024-01-02", 100, 100], ["2024-01-03", 100, 100]], [["2024-01-03", 2]]);
    const dates = ["2024-01-02", "2024-01-03"];
    const re = spyBuyAndHold(doc, dates, { startEquity: 100_000, costPerShare: 0 });
    const cash = spyBuyAndHold(doc, dates, { startEquity: 100_000, costPerShare: 0, reinvest: false });
    expect(re.dividends).toBeCloseTo(2_000, 9);
    expect(re.shares).toBe(1_020);
    expect(cash.shares).toBe(1_000);
    expect(re.curve[1].equity).toBeCloseTo(cash.curve[1].equity, 9);
  });

  it("refuses a strategy session the SPY file lacks, never filling it in", () => {
    const doc = yahoo([["2024-01-02", 100, 100]]);
    expect(() => spyBuyAndHold(doc, ["2024-01-02", "2024-01-03"], { startEquity: 1_000 })).toThrow(/extend the file/);
  });
});

describe("edge-isolation order", () => {
  it("orders campaigns as the original report does: opening time, then symbol", async () => {
    const { byOpen } = await import("../../scripts/edge-isolation.mjs");
    const t = (symbol: string, openedAt: string) => ({ symbol, openedAt });
    expect(byOpen([t("B", "2024-01-02"), t("A", "2024-01-03"), t("A", "2024-01-02")]).map((x: { symbol: string; openedAt: string }) => x.symbol + x.openedAt)).toEqual(["A2024-01-02", "B2024-01-02", "A2024-01-03"]);
  });
});
