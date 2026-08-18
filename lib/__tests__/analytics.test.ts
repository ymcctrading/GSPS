import { describe, expect, it } from "vitest";
import {
  isClosedTrade,
  winLossSummary,
  profitFactor,
  sharpeRatio,
  maxDrawdown,
  monthlyPnl,
  quarterlyPnl,
  performanceByPattern,
  computePortfolioAnalytics,
  type ClosedTrade,
} from "@/lib/portfolio/analytics";

const trade = (over: Partial<ClosedTrade> = {}): ClosedTrade => ({
  symbol: "AAPL",
  direction: "buy",
  quantity: 10,
  entry_timestamp: "2026-01-02T15:00:00Z",
  entry_price: 100,
  exit_timestamp: "2026-01-03T15:00:00Z",
  exit_price: 105,
  outcome: "profit",
  profit_loss_dollars: 50,
  profit_loss_percent: 5,
  signal_called: "2-2 Reversal",
  ...over,
});

describe("isClosedTrade", () => {
  it("accepts a settled profit/loss row", () => {
    expect(isClosedTrade(trade())).toBe(true);
  });

  it("rejects pending trades", () => {
    expect(
      isClosedTrade(
        trade({
          outcome: "pending",
          exit_timestamp: null,
          exit_price: null,
          profit_loss_dollars: null,
        }),
      ),
    ).toBe(false);
  });

  it("rejects a row missing exit price even if outcome is set", () => {
    expect(isClosedTrade(trade({ exit_price: null }))).toBe(false);
  });
});

describe("winLossSummary", () => {
  it("counts wins and losses and computes win rate", () => {
    const trades = [
      trade({ outcome: "profit" }),
      trade({ outcome: "profit" }),
      trade({ outcome: "loss", profit_loss_dollars: -20 }),
    ];
    const summary = winLossSummary(trades);
    expect(summary.trades).toBe(3);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.winRatePct).toBeCloseTo((2 / 3) * 100, 10);
    expect(summary.winLossRatio).toBeCloseTo(2, 10);
  });

  it("returns nulls for zero closed trades", () => {
    const summary = winLossSummary([]);
    expect(summary.trades).toBe(0);
    expect(summary.winRatePct).toBeNull();
    expect(summary.winLossRatio).toBeNull();
  });

  it("returns a null winLossRatio when there are no losses (never Infinity)", () => {
    const summary = winLossSummary([trade({ outcome: "profit" }), trade({ outcome: "profit" })]);
    expect(summary.winLossRatio).toBeNull();
  });

  it("ignores pending trades", () => {
    const summary = winLossSummary([
      trade({ outcome: "profit" }),
      trade({ outcome: "pending", exit_timestamp: null, exit_price: null, profit_loss_dollars: null }),
    ]);
    expect(summary.trades).toBe(1);
  });
});

describe("profitFactor", () => {
  it("computes gross profit over gross loss", () => {
    const trades = [
      trade({ outcome: "profit", profit_loss_dollars: 100 }),
      trade({ outcome: "profit", profit_loss_dollars: 50 }),
      trade({ outcome: "loss", profit_loss_dollars: -30 }),
    ];
    expect(profitFactor(trades)).toBeCloseTo(150 / 30, 10);
  });

  it("returns null when there are no closed trades", () => {
    expect(profitFactor([])).toBeNull();
  });

  it("returns null for an all-wins sample (no loss to divide by, not Infinity)", () => {
    const trades = [
      trade({ outcome: "profit", profit_loss_dollars: 100 }),
      trade({ outcome: "profit", profit_loss_dollars: 50 }),
    ];
    expect(profitFactor(trades)).toBeNull();
  });

  it("returns 0 for an all-losses sample", () => {
    const trades = [
      trade({ outcome: "loss", profit_loss_dollars: -10 }),
      trade({ outcome: "loss", profit_loss_dollars: -20 }),
    ];
    expect(profitFactor(trades)).toBe(0);
  });
});

describe("sharpeRatio", () => {
  it("returns null with fewer than 2 trades", () => {
    expect(sharpeRatio([])).toBeNull();
    expect(sharpeRatio([trade()])).toBeNull();
  });

  it("returns null when every return is identical (zero variance)", () => {
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_percent: 2 }),
      trade({ exit_timestamp: "2026-01-02T00:00:00Z", profit_loss_percent: 2 }),
      trade({ exit_timestamp: "2026-01-03T00:00:00Z", profit_loss_percent: 2 }),
    ];
    expect(sharpeRatio(trades)).toBeNull();
  });

  it("is positive for a series of consistently positive, varying returns", () => {
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_percent: 1 }),
      trade({ exit_timestamp: "2026-01-15T00:00:00Z", profit_loss_percent: 3 }),
      trade({ exit_timestamp: "2026-02-01T00:00:00Z", profit_loss_percent: 2 }),
      trade({ exit_timestamp: "2026-02-15T00:00:00Z", profit_loss_percent: 4 }),
    ];
    const sharpe = sharpeRatio(trades);
    expect(sharpe).not.toBeNull();
    expect(sharpe!).toBeGreaterThan(0);
  });

  it("is negative for a series of consistently negative, varying returns", () => {
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_percent: -1 }),
      trade({ exit_timestamp: "2026-01-15T00:00:00Z", profit_loss_percent: -3 }),
      trade({ exit_timestamp: "2026-02-01T00:00:00Z", profit_loss_percent: -2 }),
    ];
    const sharpe = sharpeRatio(trades);
    expect(sharpe).not.toBeNull();
    expect(sharpe!).toBeLessThan(0);
  });
});

describe("maxDrawdown", () => {
  it("computes peak-to-trough drawdown on a known synthetic series", () => {
    // Cumulative equity: +100, +50 (150), -180 (-30), +40 (10)
    // Peak is 150 at trade 2; trough after that peak is -30 at trade 3.
    // Max drawdown = 150 - (-30) = 180. Pct = 180 / 150 = 120%.
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_dollars: 100, outcome: "profit" }),
      trade({ exit_timestamp: "2026-01-02T00:00:00Z", profit_loss_dollars: 50, outcome: "profit" }),
      trade({ exit_timestamp: "2026-01-03T00:00:00Z", profit_loss_dollars: -180, outcome: "loss" }),
      trade({ exit_timestamp: "2026-01-04T00:00:00Z", profit_loss_dollars: 40, outcome: "profit" }),
    ];
    const result = maxDrawdown(trades);
    expect(result.curve.map((p) => p.equity)).toEqual([100, 150, -30, 10]);
    expect(result.maxDrawdownDollars).toBeCloseTo(180, 10);
    expect(result.maxDrawdownPct).toBeCloseTo(120, 10);
  });

  it("returns zero drawdown for a monotonically increasing curve", () => {
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_dollars: 10, outcome: "profit" }),
      trade({ exit_timestamp: "2026-01-02T00:00:00Z", profit_loss_dollars: 20, outcome: "profit" }),
    ];
    const result = maxDrawdown(trades);
    expect(result.maxDrawdownDollars).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
  });

  it("handles empty input without throwing", () => {
    const result = maxDrawdown([]);
    expect(result.curve).toEqual([]);
    expect(result.maxDrawdownDollars).toBe(0);
    expect(result.maxDrawdownPct).toBeNull();
  });

  it("returns a null pct when the peak at max drawdown is non-positive", () => {
    // Cumulative equity: -50, -100. Peak is -50 (never positive).
    const trades = [
      trade({ exit_timestamp: "2026-01-01T00:00:00Z", profit_loss_dollars: -50, outcome: "loss" }),
      trade({ exit_timestamp: "2026-01-02T00:00:00Z", profit_loss_dollars: -50, outcome: "loss" }),
    ];
    const result = maxDrawdown(trades);
    expect(result.maxDrawdownDollars).toBeCloseTo(50, 10);
    expect(result.maxDrawdownPct).toBeNull();
  });
});

describe("monthlyPnl", () => {
  it("buckets trades by calendar month across a year boundary", () => {
    const trades = [
      trade({ exit_timestamp: "2025-12-15T12:00:00Z", profit_loss_dollars: 100 }),
      trade({ exit_timestamp: "2025-12-28T12:00:00Z", profit_loss_dollars: -30 }),
      trade({ exit_timestamp: "2026-01-05T12:00:00Z", profit_loss_dollars: 60 }),
    ];
    const buckets = monthlyPnl(trades);
    expect(buckets).toEqual([
      { key: "2025-12", pnlDollars: 70, trades: 2 },
      { key: "2026-01", pnlDollars: 60, trades: 1 },
    ]);
  });

  it("returns an empty array for no closed trades", () => {
    expect(monthlyPnl([])).toEqual([]);
  });
});

describe("quarterlyPnl", () => {
  it("buckets trades by calendar quarter", () => {
    const trades = [
      trade({ exit_timestamp: "2026-01-10T00:00:00Z", profit_loss_dollars: 50 }),
      trade({ exit_timestamp: "2026-03-20T00:00:00Z", profit_loss_dollars: 25 }),
      trade({ exit_timestamp: "2026-04-01T00:00:00Z", profit_loss_dollars: -10 }),
    ];
    const buckets = quarterlyPnl(trades);
    expect(buckets).toEqual([
      { key: "2026-Q1", pnlDollars: 75, trades: 2 },
      { key: "2026-Q2", pnlDollars: -10, trades: 1 },
    ]);
  });
});

describe("performanceByPattern", () => {
  it("groups by signal_called and reports per-group stats, sorted by total P&L desc", () => {
    const trades = [
      trade({ signal_called: "2-2 Reversal", outcome: "profit", profit_loss_dollars: 100 }),
      trade({ signal_called: "2-2 Reversal", outcome: "loss", profit_loss_dollars: -40 }),
      trade({ signal_called: "Breakout", outcome: "profit", profit_loss_dollars: 20 }),
    ];
    const perf = performanceByPattern(trades);
    expect(perf).toHaveLength(2);
    expect(perf[0].pattern).toBe("2-2 Reversal");
    expect(perf[0].trades).toBe(2);
    expect(perf[0].wins).toBe(1);
    expect(perf[0].losses).toBe(1);
    expect(perf[0].winRatePct).toBeCloseTo(50, 10);
    expect(perf[0].totalPnlDollars).toBeCloseTo(60, 10);
    expect(perf[0].avgPnlDollars).toBeCloseTo(30, 10);
    expect(perf[1].pattern).toBe("Breakout");
  });

  it("buckets blank signal_called under Unspecified", () => {
    const perf = performanceByPattern([trade({ signal_called: "" })]);
    expect(perf[0].pattern).toBe("Unspecified");
  });

  it("returns an empty array for no closed trades", () => {
    expect(performanceByPattern([])).toEqual([]);
  });
});

describe("computePortfolioAnalytics", () => {
  it("handles zero trades gracefully across every metric", () => {
    const analytics = computePortfolioAnalytics([]);
    expect(analytics.winLoss.trades).toBe(0);
    expect(analytics.profitFactor).toBeNull();
    expect(analytics.sharpeRatio).toBeNull();
    expect(analytics.drawdown.maxDrawdownDollars).toBe(0);
    expect(analytics.monthlyPnl).toEqual([]);
    expect(analytics.quarterlyPnl).toEqual([]);
    expect(analytics.byPattern).toEqual([]);
  });

  it("assembles all metrics for a small mixed sample", () => {
    const trades = [
      trade({
        exit_timestamp: "2026-01-05T00:00:00Z",
        outcome: "profit",
        profit_loss_dollars: 100,
        profit_loss_percent: 5,
        signal_called: "Breakout",
      }),
      trade({
        exit_timestamp: "2026-02-10T00:00:00Z",
        outcome: "loss",
        profit_loss_dollars: -40,
        profit_loss_percent: -2,
        signal_called: "Breakout",
      }),
    ];
    const analytics = computePortfolioAnalytics(trades);
    expect(analytics.winLoss.wins).toBe(1);
    expect(analytics.winLoss.losses).toBe(1);
    expect(analytics.profitFactor).toBeCloseTo(2.5, 10);
    expect(analytics.byPattern).toHaveLength(1);
  });
});
