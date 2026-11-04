import { describe, expect, it } from "vitest";
import { simulatePortfolio, type PortfolioTrade } from "@/lib/backtest/portfolio";

const t = (symbol: string, open: string, close: string | null, entry: number, stop: number, r: number, side: "long" | "short" = "long"): PortfolioTrade => ({
  symbol,
  openedAt: `${open}T05:00:00Z`,
  closedAt: close ? `${close}T05:00:00Z` : null,
  entry,
  stop,
  side,
  rMultiple: r,
});

describe("simulatePortfolio", () => {
  it("sizes from the stop, rounds down and books R times dollar risk", () => {
    // 0.5% of 100,000 = 500; risk 3 a share → 166 shares; notional cap 20% = 20,000 / 50 = 400.
    const res = simulatePortfolio([t("AAA", "2026-01-05", "2026-01-09", 50, 47, 2)]);
    expect(res.taken).toBe(1);
    expect(res.endEquity).toBeCloseTo(100_000 + 2 * 166 * 3, 6);
  });

  it("skips a campaign whose single share exceeds the budget", () => {
    const res = simulatePortfolio([t("BIG", "2026-01-05", "2026-01-09", 5000, 4000, 1)], { startEquity: 10_000 });
    expect(res.taken).toBe(0);
    expect(res.skipped["unit over budget"]).toBe(1);
    expect(res.endEquity).toBe(10_000);
  });

  it("caps the notional of one campaign", () => {
    // A tight stop asks for 5,000 shares; 20% of 100,000 at 100 allows 200.
    const res = simulatePortfolio([t("AAA", "2026-01-05", "2026-01-06", 100, 99.9, 1)]);
    expect(res.endEquity).toBeCloseTo(100_000 + 1 * 200 * 0.1, 6);
  });

  it("enforces the concurrency and open-risk caps", () => {
    const many = Array.from({ length: 5 }, (_, i) => t(`S${i}`, "2026-01-05", "2026-02-02", 50, 47, 1));
    expect(simulatePortfolio(many, { maxConcurrent: 3 }).skipped["concurrency cap"]).toBe(2);
    // Each campaign risks 498 (0.498%); a 1% cap fits two.
    const capped = simulatePortfolio(many, { maxOpenRiskFraction: 0.01 });
    expect(capped.taken).toBe(2);
    expect(capped.skipped["open risk cap"]).toBe(3);
  });

  it("frees a closed campaign's risk before the same session's entries", () => {
    const res = simulatePortfolio(
      [t("A", "2026-01-05", "2026-01-07", 50, 47, -1), t("B", "2026-01-07", "2026-01-09", 50, 47, 1)],
      { maxConcurrent: 1 },
    );
    expect(res.taken).toBe(2);
  });

  it("refuses invalid levels and counts them", () => {
    const res = simulatePortfolio([t("A", "2026-01-05", "2026-01-07", 50, 50, 1), t("B", "2026-01-05", "2026-01-07", NaN, 47, 1)]);
    expect(res.skipped["invalid levels"]).toBe(2);
    expect(res.taken).toBe(0);
  });

  it("marks open campaigns to market when closes are given", () => {
    const closes = new Map([
      ["AAA", [
        { t: "2026-01-05T05:00:00Z", c: 50 },
        { t: "2026-01-06T05:00:00Z", c: 44 },
        { t: "2026-01-07T05:00:00Z", c: 53 },
      ]],
    ]);
    const res = simulatePortfolio([t("AAA", "2026-01-05", "2026-01-07", 50, 47, 1)], { closes });
    // 166 shares; the 44 close marks −996 before the exit books +498.
    expect(res.curve.map((p) => Math.round(p.equity))).toEqual([100_000, 99_004, 100_498]);
    expect(res.maxDrawdown).toBeCloseTo(996 / 100_000, 9);
    expect(res.assumptions.some((a) => a.includes("marked to each session's close"))).toBe(true);
  });

  it("says when equity moves only on exits", () => {
    const res = simulatePortfolio([t("AAA", "2026-01-05", "2026-01-09", 50, 47, 1)]);
    expect(res.assumptions.some((a) => a.includes("no mark-to-market"))).toBe(true);
    expect(res.curve.length).toBe(5);
    expect(res.exposure).toBeCloseTo(4 / 5, 9);
  });

  it("counts a campaign that opens on no session", () => {
    // 2026-01-10 is a Saturday: the weekday grid has no such session.
    const res = simulatePortfolio([t("A", "2026-01-05", "2026-01-09", 50, 47, 1), t("B", "2026-01-10", "2026-01-12", 50, 47, 1)]);
    expect(res.skipped["no session"]).toBe(1);
    expect(res.taken).toBe(1);
  });

  it("books a short's R the same way", () => {
    const res = simulatePortfolio([t("AAA", "2026-01-05", "2026-01-09", 47, 50, -1, "short")]);
    expect(res.endEquity).toBeCloseTo(100_000 - 166 * 3, 6);
  });
});
