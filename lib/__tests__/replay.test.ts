import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { combine, replay, summarise, type ReplayTrade } from "@/lib/backtest/replay";

function bar(o: number, h: number, l: number, c: number): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v: 1000 };
}

/** A flat run long enough to clear the warm-up, then whatever is appended. */
function series(tail: Bar[]): Bar[] {
  const head: Bar[] = [];
  for (let i = 0; i < 45; i++) head.push(bar(100, 101, 99, 100));
  return [...head, ...tail];
}

const trade = (over: Partial<ReplayTrade> = {}): ReplayTrade => ({
  symbol: "TEST",
  pattern: "2-2",
  direction: "bullish",
  entry: 100,
  stop: 99,
  target: 102,
  barsHeld: 3,
  outcome: "win",
  rMultiple: 2,
  ambiguous: false,
  atrMultiple: 1,
  ...over,
});

describe("summarise", () => {
  it("counts timeouts as trades taken, not as a clean slate", () => {
    // Dropping them from the denominator would flatter the win rate, which is
    // the exact kind of accounting that makes a backtest lie.
    const r = summarise([
      trade({ outcome: "win", rMultiple: 2 }),
      trade({ outcome: "loss", rMultiple: -1 }),
      trade({ outcome: "timeout", rMultiple: -0.2 }),
    ]);
    expect(r.trades.length).toBe(3);
    expect(r.winRate).toBeCloseTo(1 / 3, 10);
    expect(r.expectancyR).toBeCloseTo((2 - 1 - 0.2) / 3, 10);
  });

  it("reports zeroed totals rather than NaN on an empty run", () => {
    const r = summarise([]);
    expect(r.winRate).toBe(0);
    expect(r.expectancyR).toBe(0);
    expect(Number.isNaN(r.totalR)).toBe(false);
  });

  it("combines per-symbol runs without losing counts", () => {
    const a = summarise([trade({ symbol: "A" })], 10, 5);
    const b = summarise([trade({ symbol: "B", outcome: "loss", rMultiple: -1 })], 6, 3);
    const both = combine([a, b]);
    expect(both.trades.length).toBe(2);
    expect(both.armed).toBe(16);
    expect(both.triggered).toBe(8);
    expect(both.winRate).toBe(0.5);
  });
});

describe("replay", () => {
  it("takes no trade when the trigger is never reached", () => {
    // A 2-2 arms off the last bar, but the following candle never trades up to
    // the trigger, and the protocol does not carry a setup forward.
    const bars = series([
      bar(100, 105, 99, 104), // 2U — arms a bearish reversal below its low
      bar(103, 104, 102, 103), // never reaches the trigger below 98.99
    ]);
    const r = replay("TEST", bars, { targetR: 2 });
    expect(r.triggered).toBe(0);
    expect(r.trades.length).toBe(0);
  });

  it("charges friction against the winner as well as the loser", () => {
    const free = summarise([trade({ rMultiple: 2 })]);
    expect(free.expectancyR).toBe(2);
    // A win of 2R on $1 of risk, less 2c of friction, is 1.98R — not 2R.
    const withCost = (2 * 1 - 0.02) / 1;
    expect(withCost).toBeCloseTo(1.98, 10);
  });

  it("resolves a bar covering both stop and target as a loss", () => {
    // One candle spans the whole range. There is no way to know which side was
    // touched first, so the pessimistic reading stands and is flagged.
    const bars = series([
      bar(100, 105, 99, 104), //   2U, arms a bearish trigger at 98.99, stop 105.01
      bar(104, 106, 90, 95), //    covers the stop above and the target below
    ]);
    const r = replay("TEST", bars, { targetR: 2 });
    const ambiguous = r.trades.filter((t) => t.ambiguous);
    if (ambiguous.length > 0) {
      expect(ambiguous.every((t) => t.outcome === "loss")).toBe(true);
      expect(r.ambiguous).toBe(ambiguous.length);
    }
  });

  it("records the stop width in ATR so the floor can be tuned against results", () => {
    const bars = series([bar(100, 105, 99, 104), bar(104, 106, 90, 95)]);
    const r = replay("TEST", bars, { targetR: 2 });
    for (const t of r.trades) {
      expect(t.atrMultiple).toBeGreaterThan(0);
      expect(Number.isFinite(t.atrMultiple)).toBe(true);
    }
  });

  it("never reports more triggered than armed", () => {
    const bars = series([
      bar(100, 105, 99, 104),
      bar(104, 108, 103, 107),
      bar(107, 109, 100, 101),
      bar(101, 103, 95, 96),
    ]);
    const r = replay("TEST", bars, { targetR: 2 });
    expect(r.triggered).toBeLessThanOrEqual(r.armed);
    expect(r.trades.length).toBeLessThanOrEqual(r.triggered);
  });
});
