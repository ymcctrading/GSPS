import { describe, expect, it } from "vitest";
import { maxDrawdown, sharpeRatio, type EquityPoint } from "@/lib/portfolio/equity-metrics";

function point(trade_date: string, pnl: number, equity: number): EquityPoint {
  return { trade_date, pnl, equity };
}

describe("maxDrawdown", () => {
  it("returns null for an empty series", () => {
    expect(maxDrawdown([])).toBeNull();
  });

  it("is zero for a monotonically rising equity curve", () => {
    const points = [point("2026-01-01", 100, 100), point("2026-01-02", 100, 200)];
    expect(maxDrawdown(points)).toEqual({ amount: 0, percent: 0 });
  });

  it("finds the largest peak-to-trough drop, not just the last one", () => {
    // equity: 100 -> 300 (peak) -> 150 (drop of 150) -> 250 -> 220 (drop of 80 from 300 peak... wait peak resets)
    const points = [
      point("2026-01-01", 100, 100),
      point("2026-01-02", 200, 300), // peak
      point("2026-01-03", -150, 150), // drawdown 150 from peak 300
      point("2026-01-04", 100, 250), // recovering, new peak not yet
      point("2026-01-05", -30, 220), // drawdown 80 from peak 300 — smaller than 150
    ];
    const result = maxDrawdown(points);
    expect(result?.amount).toBe(150);
    expect(result?.percent).toBeCloseTo(50, 5); // 150 / 300 * 100
  });

  it("returns a null percent when the peak is zero", () => {
    const points = [point("2026-01-01", 0, 0), point("2026-01-02", -50, -50)];
    const result = maxDrawdown(points);
    expect(result?.amount).toBe(50);
    expect(result?.percent).toBeNull();
  });
});

describe("sharpeRatio", () => {
  it("returns null for fewer than 2 trades", () => {
    expect(sharpeRatio([])).toBeNull();
    expect(sharpeRatio([point("2026-01-01", 100, 100)])).toBeNull();
  });

  it("returns null when every trade has the same P&L (zero variance)", () => {
    const points = [
      point("2026-01-01", 50, 50),
      point("2026-01-02", 50, 100),
      point("2026-01-03", 50, 150),
    ];
    expect(sharpeRatio(points)).toBeNull();
  });

  it("is positive when average returns are positive", () => {
    const points = [
      point("2026-01-01", 100, 100),
      point("2026-02-01", -20, 80),
      point("2026-03-01", 150, 230),
      point("2026-04-01", -10, 220),
    ];
    const ratio = sharpeRatio(points);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThan(0);
  });

  it("is negative when average returns are negative", () => {
    const points = [
      point("2026-01-01", -100, -100),
      point("2026-02-01", 20, -80),
      point("2026-03-01", -150, -230),
      point("2026-04-01", 10, -220),
    ];
    const ratio = sharpeRatio(points);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(0);
  });
});
