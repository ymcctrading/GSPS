import { describe, expect, it } from "vitest";
import { computeRequiredMetrics } from "../metrics";
import type { ReplayTrade } from "../replay";

function trade(overrides: Partial<ReplayTrade>): ReplayTrade {
  return {
    symbol: "TEST",
    openedAt: "2026-01-01T00:00:00Z",
    pattern: "2-1-2",
    direction: "bullish",
    entry: 100,
    stop: 99,
    target: 102,
    barsHeld: 4,
    outcome: "win",
    rMultiple: 1,
    ambiguous: false,
    atrMultiple: 1,
    ...overrides,
  };
}

describe("computeRequiredMetrics", () => {
  it("returns nulls rather than NaN on an empty run", () => {
    const m = computeRequiredMetrics([]);
    expect(m.sampleSize).toBe(0);
    expect(m.avgWinR).toBeNull();
    expect(m.medianWinR).toBeNull();
    expect(m.avgLossR).toBeNull();
    expect(m.maxLossR).toBeNull();
    expect(m.profitFactor).toBeNull();
    expect(m.maxDrawdownR).toBe(0);
    expect(m.avgBarsHeld).toBeNull();
  });

  it("splits win/loss by outcome, not by the sign of rMultiple", () => {
    // A "win" that lost to friction still counts as a win for this split —
    // matches replay.ts's own win/loss counts, which are outcome-based.
    const trades = [
      trade({ outcome: "win", rMultiple: -0.02 }),
      trade({ outcome: "loss", rMultiple: -1 }),
    ];
    const m = computeRequiredMetrics(trades);
    expect(m.avgWinR).toBe(-0.02);
    expect(m.avgLossR).toBe(-1);
  });

  it("computes average/median win and loss, max loss, and profit factor", () => {
    const trades = [
      trade({ outcome: "win", rMultiple: 2, openedAt: "2026-01-01T00:00:00Z" }),
      trade({ outcome: "win", rMultiple: 4, openedAt: "2026-01-02T00:00:00Z" }),
      trade({ outcome: "loss", rMultiple: -1, openedAt: "2026-01-03T00:00:00Z" }),
      trade({ outcome: "loss", rMultiple: -3, openedAt: "2026-01-04T00:00:00Z" }),
    ];
    const m = computeRequiredMetrics(trades);
    expect(m.sampleSize).toBe(4);
    expect(m.avgWinR).toBe(3);
    expect(m.medianWinR).toBe(3);
    expect(m.avgLossR).toBe(-2);
    expect(m.medianLossR).toBe(-2);
    expect(m.maxLossR).toBe(-3);
    // gross profit 6, gross loss 4
    expect(m.profitFactor).toBe(1.5);
  });

  it("has no profit factor when nothing lost", () => {
    const trades = [trade({ outcome: "win", rMultiple: 1 })];
    expect(computeRequiredMetrics(trades).profitFactor).toBeNull();
  });

  it("computes peak-to-trough drawdown over the chronological R curve, independent of input order", () => {
    // +2, -3, +1 -> cumulative 2, -1, 0 -> peak 2, trough -1 -> drawdown 3
    const chronological = [
      trade({ outcome: "win", rMultiple: 2, openedAt: "2026-01-01T00:00:00Z" }),
      trade({ outcome: "loss", rMultiple: -3, openedAt: "2026-01-02T00:00:00Z" }),
      trade({ outcome: "win", rMultiple: 1, openedAt: "2026-01-03T00:00:00Z" }),
    ];
    const shuffled = [chronological[2], chronological[0], chronological[1]];

    expect(computeRequiredMetrics(chronological).maxDrawdownR).toBe(3);
    expect(computeRequiredMetrics(shuffled).maxDrawdownR).toBe(3);
  });

  it("averages and medians bars held across every trade, wins and losses alike", () => {
    const trades = [
      trade({ barsHeld: 2 }),
      trade({ barsHeld: 4 }),
      trade({ barsHeld: 6 }),
    ];
    const m = computeRequiredMetrics(trades);
    expect(m.avgBarsHeld).toBe(4);
    expect(m.medianBarsHeld).toBe(4);
  });
});
