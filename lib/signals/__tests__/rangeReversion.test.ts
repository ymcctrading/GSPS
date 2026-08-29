import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateRangeReversion } from "../states/rangeReversion";
import type { SignalGates } from "../types";

function bar(o: number, h: number, l: number, c: number, v = 500): Bar {
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
 * A flat, oscillating range with repeated touches on both boundaries, then
 * a final bar that — optionally — tests the low and rejects back inside.
 */
function rangeBars(opts: { rejection?: boolean; breakoutVolume?: number } = {}): Bar[] {
  const bars: Bar[] = [];
  const high = 110;
  const low = 100;

  // Oscillate between the boundaries: touch high, retrace, touch low, retrace...
  for (let i = 0; i < 24; i++) {
    const atHigh = i % 4 === 0;
    const atLow = i % 4 === 2;
    if (atHigh) bars.push(bar(high - 0.5, high, high - 1, high - 0.3, 500));
    else if (atLow) bars.push(bar(low + 0.5, low + 1, low, low + 0.3, 500));
    else bars.push(bar(105, 106, 104, 105.2, 500));
  }

  // A few settling bars away from either boundary before the test bar.
  bars.push(bar(105, 105.5, 104.5, 105, 500));
  bars.push(bar(105, 105.5, 104.5, 104.8, 500));
  bars.push(bar(104.8, 105, 103.5, 103.8, 500));
  bars.push(bar(103.8, 104, 102, 102.5, 500));

  if (opts.rejection) {
    // Tests the low, closes back inside the range.
    bars.push(bar(102.5, 103, low - 0.1, low + 0.8, opts.breakoutVolume ?? 500));
  } else {
    // Decisively breaks and holds below the low — no rejection.
    bars.push(bar(102.5, 102.8, low - 2, low - 1.5, 500));
  }

  return bars;
}

describe("evaluateRangeReversion", () => {
  it("disqualifies outright on a hard gate failure, before any scoring", () => {
    const bars = rangeBars({ rejection: true });
    const verdict = evaluateRangeReversion({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: { ...PASSING_GATES, staleData: true },
    });
    expect(verdict.status).toBe("disqualified");
  });

  it("is not tradeable when the boundary breaks instead of holding", () => {
    const bars = rangeBars({ rejection: false });
    const verdict = evaluateRangeReversion({
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

  it("scores a verified range with a confirmed boundary rejection as tradeable", () => {
    const bars = rangeBars({ rejection: true, breakoutVolume: 500 });
    const verdict = evaluateRangeReversion({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const verifiedRange = verdict.alignment.breakdown.find((b) => b.key === "verifiedRange");
      const rejection = verdict.alignment.breakdown.find((b) => b.key === "rejectionConfirmation");
      const midpoint = verdict.alignment.breakdown.find((b) => b.key === "atBoundaryNotMidpoint");
      expect(verifiedRange?.passed).toBe(true);
      expect(rejection?.passed).toBe(true);
      expect(midpoint?.passed).toBe(true);
      expect(verdict.tradeable).toBe(true);
      expect(verdict.plan).not.toBeNull();
      expect(verdict.plan?.stop).toBeLessThan(verdict.plan!.entryTrigger);
      // Target is the opposite (high) boundary, not a midpoint projection.
      expect(verdict.plan?.target).toBeGreaterThan(verdict.plan!.entryTrigger);
    }
  });

  it("does not confirm a rejection on breakout-sized volume", () => {
    const bars = rangeBars({ rejection: true, breakoutVolume: 1500 });
    const verdict = evaluateRangeReversion({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const volume = verdict.alignment.breakdown.find((b) => b.key === "noBreakoutVolumeSpike");
      expect(volume?.passed).toBe(false);
    }
  });

  it("never renders a probability field on the verdict", () => {
    const bars = rangeBars({ rejection: true });
    const verdict = evaluateRangeReversion({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(JSON.stringify(verdict).toLowerCase()).not.toContain("probability");
  });
});
