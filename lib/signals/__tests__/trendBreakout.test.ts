import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateTrendBreakout } from "../states/trendBreakout";
import type { SignalGates } from "../types";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

const PASSING_GATES: SignalGates = {
  eligibleUniverse: true,
  operatingCandleClosed: true,
  staleData: false,
  binaryEventInHoldPeriod: false,
  liquiditySpreadPass: true,
  benchmarkSectorAlignment: true,
  targetRoomAvailable: true,
  stopWithinNovicePolicy: true,
  positionSizeAvailable: true,
  correlationConcentrationPass: true,
  cooldownPass: true,
  totalOpenRiskPass: true,
  dataQualityOk: true,
};

/**
 * A volatile run-up (so the pre-base baseline ATR is wide), then a tight
 * sideways base (volatility contraction + repeated boundary touches), then
 * — optionally — a decisive breakout bar on high volume.
 */
function baseAndBreakoutBars(opts: { breakout?: boolean; breakoutVolume?: number } = {}): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  // Volatile baseline: wide daily swings, low volume.
  for (let i = 0; i < 40; i++) {
    const move = i % 2 === 0 ? 3 : -2.5;
    const o = price;
    const c = price + move;
    bars.push(bar(o, Math.max(o, c) + 1, Math.min(o, c) - 1, c, 800));
    price = c;
  }
  // Tight base: oscillates between two close boundaries, touched repeatedly.
  const baseHigh = price + 1;
  const baseLow = price - 1;
  for (let i = 0; i < 15; i++) {
    const atTop = i % 2 === 0;
    const o = atTop ? baseLow + 0.2 : baseHigh - 0.2;
    const c = atTop ? baseHigh - 0.1 : baseLow + 0.1;
    bars.push(bar(o, atTop ? baseHigh : baseHigh - 0.1, atTop ? baseLow + 0.1 : baseLow, c, 400));
  }
  if (opts.breakout) {
    bars.push(bar(baseHigh - 0.1, baseHigh + 2, baseHigh - 0.2, baseHigh + 1.8, opts.breakoutVolume ?? 1200));
  } else {
    // One more bar still inside the base — no breakout yet.
    bars.push(bar(baseLow + 0.2, baseHigh - 0.1, baseLow, baseHigh - 0.3, 400));
  }
  return bars;
}

describe("evaluateTrendBreakout", () => {
  it("disqualifies outright on a hard gate failure, before any scoring", () => {
    const bars = baseAndBreakoutBars({ breakout: true });
    const verdict = evaluateTrendBreakout({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: { ...PASSING_GATES, staleData: true },
    });
    expect(verdict.status).toBe("disqualified");
  });

  it("is not tradeable while price is still inside the base", () => {
    const bars = baseAndBreakoutBars({ breakout: false });
    const verdict = evaluateTrendBreakout({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      expect(verdict.tradeable).toBe(false);
      expect(verdict.plan).toBeNull();
    }
  });

  it("scores a validated base with a decisive, high-volume breakout as tradeable", () => {
    const bars = baseAndBreakoutBars({ breakout: true, breakoutVolume: 1200 });
    const verdict = evaluateTrendBreakout({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const validatedBase = verdict.alignment.breakdown.find((b) => b.key === "validatedBase");
      const confirmation = verdict.alignment.breakdown.find((b) => b.key === "confirmationClose");
      expect(validatedBase?.passed).toBe(true);
      expect(confirmation?.passed).toBe(true);
      expect(verdict.tradeable).toBe(true);
      expect(verdict.plan).not.toBeNull();
      expect(verdict.plan?.stop).toBeLessThan(verdict.plan!.entryTrigger);
    }
  });

  it("does not confirm a breakout without volume expansion", () => {
    const bars = baseAndBreakoutBars({ breakout: true, breakoutVolume: 350 });
    const verdict = evaluateTrendBreakout({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const volume = verdict.alignment.breakdown.find((b) => b.key === "volumeExpansion");
      expect(volume?.passed).toBe(false);
      expect(verdict.tradeable).toBe(false);
    }
  });

  it("never renders a probability field on the verdict", () => {
    const bars = baseAndBreakoutBars({ breakout: true });
    const verdict = evaluateTrendBreakout({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(JSON.stringify(verdict).toLowerCase()).not.toContain("probability");
  });
});
