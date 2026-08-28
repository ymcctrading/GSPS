import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateConfirmedReversal } from "../states/confirmedReversal";
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
 * A small swing-high pivot, then a sustained decline into a sharp capitulation
 * low (the exhaustion extreme), then — optionally — a break back above the
 * swing high held for a second confirming bar.
 */
function reversalBars(opts: { confirmed?: boolean; breakoutVolume?: number } = {}): Bar[] {
  const bars: Bar[] = [];
  let price = 150;

  // Form a clean swing-high pivot at what will become index 2.
  const prePivot = [0.5, 0.8];
  for (const move of prePivot) {
    const o = price;
    const c = price + move;
    bars.push(bar(o, c + 0.1, o - 0.1, c, 500));
    price = c;
  }
  const swingHighPrice = price + 0.05; // pivot bar's high
  bars.push(bar(price, swingHighPrice, price - 0.1, price - 0.1, 500));
  price = price - 0.1;
  const postPivot = [-0.6, -0.7];
  for (const move of postPivot) {
    const o = price;
    const c = price + move;
    bars.push(bar(o, o + 0.1, c - 0.1, c, 500));
    price = c;
  }

  // Sustained decline, roughly steady, small ranges (keeps ATR modest so the
  // capitulation leg at the end reads as a clear overextension).
  for (let i = 0; i < 12; i++) {
    const o = price;
    const c = price - 0.4;
    bars.push(bar(o, o + 0.1, c - 0.1, c, 500));
    price = c;
  }

  // Capitulation leg: a sharp multi-bar plunge to the exhaustion extreme.
  for (let i = 0; i < 3; i++) {
    const o = price;
    const c = price - 3;
    bars.push(bar(o, o + 0.2, c - 0.3, c, 900));
    price = c;
  }
  const extremeLow = price - 0.3;

  if (opts.confirmed) {
    // Break bar: closes back above the swing high.
    const breakClose = swingHighPrice + 0.5;
    bars.push(bar(price, breakClose + 0.2, price - 0.1, breakClose, opts.breakoutVolume ?? 1200));
    // Confirm bar: holds above the swing high.
    const confirmClose = breakClose + 0.3;
    bars.push(bar(breakClose, confirmClose + 0.2, breakClose - 0.1, confirmClose, 800));
  } else {
    // Two more bars still below the swing high — no break yet.
    bars.push(bar(price, price + 0.3, extremeLow - 0.1, price + 0.1, 500));
    bars.push(bar(price + 0.1, price + 0.4, extremeLow - 0.1, price + 0.2, 500));
  }

  return bars;
}

describe("evaluateConfirmedReversal", () => {
  it("disqualifies outright on a hard gate failure, before any scoring", () => {
    const bars = reversalBars({ confirmed: true });
    const verdict = evaluateConfirmedReversal({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: { ...PASSING_GATES, staleData: true },
    });
    expect(verdict.status).toBe("disqualified");
  });

  it("is not tradeable while the break hasn't happened yet", () => {
    const bars = reversalBars({ confirmed: false });
    const verdict = evaluateConfirmedReversal({
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

  it("scores an exhaustion low with a confirmed structural break as tradeable", () => {
    const bars = reversalBars({ confirmed: true, breakoutVolume: 1200 });
    const verdict = evaluateConfirmedReversal({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const exhaustion = verdict.alignment.breakdown.find((b) => b.key === "exhaustionAtMeaningfulLevel");
      const structBreak = verdict.alignment.breakdown.find((b) => b.key === "structuralBreak");
      const hold = verdict.alignment.breakdown.find((b) => b.key === "confirmationHold");
      expect(exhaustion?.passed).toBe(true);
      expect(structBreak?.passed).toBe(true);
      expect(hold?.passed).toBe(true);
      expect(verdict.tradeable).toBe(true);
      expect(verdict.plan).not.toBeNull();
      expect(verdict.plan?.stop).toBeLessThan(verdict.plan!.entryTrigger);
    }
  });

  it("does not confirm a reversal without volume behind the break", () => {
    const bars = reversalBars({ confirmed: true, breakoutVolume: 400 });
    const verdict = evaluateConfirmedReversal({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(verdict.status).toBe("evaluated");
    if (verdict.status === "evaluated") {
      const volume = verdict.alignment.breakdown.find((b) => b.key === "volumeConfirmation");
      expect(volume?.passed).toBe(false);
      expect(verdict.tradeable).toBe(false);
    }
  });

  it("never renders a probability field on the verdict", () => {
    const bars = reversalBars({ confirmed: true });
    const verdict = evaluateConfirmedReversal({
      direction: "bullish",
      htfBars: bars,
      executionBars: bars,
      gates: PASSING_GATES,
    });
    expect(JSON.stringify(verdict).toLowerCase()).not.toContain("probability");
  });
});
