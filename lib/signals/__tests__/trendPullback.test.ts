import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateTrendPullback } from "../states/trendPullback";
import type { SignalGates } from "../types";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

function uptrendBars(n: number, opts: { finalPullback?: boolean } = {}): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 11;
    const inFinalPullback = opts.finalPullback && i >= n - 3;
    const rising = inFinalPullback ? false : cyclePos < 8;
    const o = price;
    const c = price + (rising ? 0.8 : -0.4);
    const h = rising ? c + 0.5 : o + 0.1;
    const l = rising ? o - 0.1 : c - 0.5;
    bars.push(bar(o, h, l, c, 1000 + (i % 5) * 50 + (inFinalPullback ? 300 : 0)));
    price = c;
  }
  return bars;
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

describe("evaluateTrendPullback", () => {
  it("disqualifies outright on a hard gate failure, before any scoring", () => {
    const bars = uptrendBars(120);
    const verdict = evaluateTrendPullback({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      vwapAnchorIndex: bars.length - 20,
      gates: { ...PASSING_GATES, staleData: true },
    });
    expect(verdict.status).toBe("disqualified");
    if (verdict.status === "disqualified") {
      expect(verdict.disqualifiers.map((d) => d.key)).toContain("staleData");
    }
  });

  it("scores a clean bullish trend with a confirmed pullback as tradeable", () => {
    const bars = uptrendBars(120, { finalPullback: true });
    const verdict = evaluateTrendPullback({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      vwapAnchorIndex: bars.length - 20,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      expect(verdict.regime.regime).toBe("trend");
      expect(verdict.alignment.score).toBeGreaterThan(0);
      const higherTf = verdict.alignment.breakdown.find((b) => b.key === "higherTimeframeDirection");
      expect(higherTf?.passed).toBe(true);
    }
  });

  it("never renders a probability field on the verdict", () => {
    const bars = uptrendBars(120, { finalPullback: true });
    const verdict = evaluateTrendPullback({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      vwapAnchorIndex: bars.length - 20,
      gates: PASSING_GATES,
    });
    expect(JSON.stringify(verdict).toLowerCase()).not.toContain("probability");
  });
});
