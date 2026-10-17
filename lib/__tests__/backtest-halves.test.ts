import { describe, expect, it } from "vitest";
import type { ReplayResult, ReplayTrade } from "@/lib/backtest/replay";
import { buildReport } from "@/lib/backtest/run";

// CYC-38: a factor's early and late halves are reported in time order, so a
// factor whose sign flips between them is visible.
function trade(i: number, win: boolean, factor: boolean): ReplayTrade {
  const day = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
  return {
    symbol: "TEST",
    openedAt: day,
    pattern: null,
    setupKind: "reversion",
    direction: "bullish",
    entry: 100,
    stop: 99,
    target: 102,
    barsHeld: 3,
    outcome: win ? "win" : "loss",
    rMultiple: win ? 2 : -1,
    ambiguous: false,
    atrMultiple: 1,
    criteria: { flipper: factor },
    contextFactors: { flipper: factor },
    largeCap: true,
  };
}

describe("buildReport: chronological halves", () => {
  // Early: the factor passes on wins and fails on losses. Late: the reverse.
  // Listed late-first so the report has to sort by open time.
  const early = Array.from({ length: 40 }, (_, i) => trade(i, i % 2 === 0, i % 2 === 0));
  const late = Array.from({ length: 40 }, (_, i) => trade(100 + i, i % 2 === 0, i % 2 !== 0));
  const trades = [...late, ...early];
  const wins = trades.filter((t) => t.outcome === "win").length;
  const overall: ReplayResult = {
    trades,
    armed: trades.length,
    triggered: trades.length,
    wins,
    losses: trades.length - wins,
    timeouts: 0,
    ambiguous: 0,
    winRate: wins / trades.length,
    expectancyR: trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length,
    totalR: trades.reduce((s, t) => s + t.rMultiple, 0),
    refusedFills: 0,
    retiredPlans: 0,
  };
  const report = buildReport(
    { source: "synthetic", live: false, timeframe: "15Min", targetR: 2, symbols: ["TEST"], skipped: [], window: { from: null, to: null }, overall },
    { symbols: ["TEST"], attributeWithin: "all" },
  );
  const delta = (half: "early" | "late", field: "factors" | "contextFactors") =>
    report.halves[half][field].find((f) => f.criterion === "flipper")!.deltaExpectancyR!;

  it("puts the earlier trades in the early half and the later ones in the late half", () => {
    expect(delta("early", "factors")).toBeGreaterThan(0);
    expect(delta("late", "factors")).toBeLessThan(0);
    expect(delta("early", "contextFactors")).toBeGreaterThan(0);
    expect(delta("late", "contextFactors")).toBeLessThan(0);
  });
});
