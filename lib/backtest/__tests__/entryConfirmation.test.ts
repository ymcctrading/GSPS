import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  backtestEntryConfirmation,
  summarizeEntryConfirmationBacktest,
} from "@/lib/backtest/entryConfirmation";

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

describe("backtestEntryConfirmation", () => {
  it("reports confirmed with the bar index it confirmed on", () => {
    const result = backtestEntryConfirmation({
      symbol: "AAPL",
      direction: "bullish",
      entryTrigger: 100,
      bars: [
        bar("t1", 99, 100.2, 98.8, 99.5), // touch
        bar("t2", 100, 101.5, 100, 101.2), // break
        bar("t3", 101, 101.1, 99.7, 100.1), // retest
        bar("t4", 100.2, 101.8, 100.1, 101.6), // confirm
      ],
    });
    expect(result.confirmed).toBe(true);
    expect(result.barsToConfirm).toBe(4);
  });

  it("reports not confirmed when the series ends before confirmation", () => {
    const result = backtestEntryConfirmation({
      symbol: "AAPL",
      direction: "bullish",
      entryTrigger: 100,
      bars: [bar("t1", 99, 100.2, 98.8, 99.5), bar("t2", 100, 101.5, 100, 101.2)],
    });
    expect(result.confirmed).toBe(false);
    expect(result.barsToConfirm).toBeNull();
  });
});

describe("summarizeEntryConfirmationBacktest", () => {
  it("computes confirmation rate and median bars-to-confirm", () => {
    const summary = summarizeEntryConfirmationBacktest([
      { symbol: "A", confirmed: true, barsToConfirm: 4, evidence: {} as never },
      { symbol: "B", confirmed: true, barsToConfirm: 6, evidence: {} as never },
      { symbol: "C", confirmed: false, barsToConfirm: null, evidence: {} as never },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.confirmedCount).toBe(2);
    expect(summary.confirmationRate).toBeCloseTo(2 / 3);
    expect(summary.medianBarsToConfirm).toBe(6);
  });
});
