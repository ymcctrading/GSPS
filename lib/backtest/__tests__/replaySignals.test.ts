import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replaySignalEngine } from "../replaySignals";

function bar(o: number, h: number, l: number, c: number, v = 1000, t = "2026-01-01T00:00:00Z"): Bar {
  return { t, o, h, l, c, v };
}

function uptrendBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 11;
    const rising = cyclePos < 8;
    const o = price;
    const c = price + (rising ? 0.8 : -0.5);
    const h = rising ? c + 0.5 : o + 0.1;
    const l = rising ? o - 0.1 : c - 0.5;
    bars.push(bar(o, h, l, c, 1000, new Date(2024, 0, i + 1).toISOString()));
    price = c;
  }
  return bars;
}

describe("replaySignalEngine", () => {
  it("evaluates only once a minimum history window has built up", () => {
    const result = replaySignalEngine("TEST", uptrendBars(60));
    expect(result.events).toHaveLength(0);
  });

  it("walks forward and tallies tiers without throwing on a longer series", () => {
    const result = replaySignalEngine("TEST", uptrendBars(150));
    expect(result.barsEvaluated).toBe(150);
    const totalTierCount = Object.values(result.tierCounts).reduce((s, n) => s + n, 0);
    expect(totalTierCount).toBe(result.events.length);
    expect(result.tradeableCount).toBeLessThanOrEqual(result.events.length);
  });
});
