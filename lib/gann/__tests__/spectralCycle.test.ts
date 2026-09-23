import { describe, expect, it } from "vitest";
import { detectSpectralCycle } from "../spectralCycle";
import type { Bar } from "@/lib/types";

function makeBars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(),
    o: c,
    h: c,
    l: c,
    c,
    v: 1000,
  }));
}

describe("detectSpectralCycle", () => {
  it("reports insufficient history under 60 bars", () => {
    const bars = makeBars(Array.from({ length: 30 }, (_, i) => 100 + i));
    const reading = detectSpectralCycle(bars);
    expect(reading.active).toBe(false);
    expect(reading.dominantPeriodBars).toBeNull();
    expect(reading.note).toMatch(/Insufficient bar history/);
  });

  it("detects a clean embedded 20-bar sinusoidal cycle as dominant", () => {
    const n = 240;
    const period = 20;
    const closes = Array.from({ length: n }, (_, i) => 100 + 0.05 * i + 10 * Math.sin((2 * Math.PI * i) / period));
    const reading = detectSpectralCycle(makeBars(closes));
    expect(reading.active).toBe(true);
    expect(reading.dominantPeriodBars).not.toBeNull();
    expect(Math.abs((reading.dominantPeriodBars ?? 0) - period)).toBeLessThanOrEqual(2);
    expect(reading.dominancePower ?? 0).toBeGreaterThan(3);
    expect(reading.repetitionCount ?? 0).toBeGreaterThan(2);
    expect(reading.hypothesisOnly).toBe(true);
    expect(reading.note).toMatch(/Hypothesis only/);
  });

  it("flags period consistency when the same cycle holds across both halves of the window", () => {
    const n = 300;
    const period = 15;
    const closes = Array.from({ length: n }, (_, i) => 50 + 8 * Math.sin((2 * Math.PI * i) / period));
    const reading = detectSpectralCycle(makeBars(closes));
    expect(reading.periodConsistent).toBe(true);
  });

  it("does not report an active dominant cycle in a flat, unvarying series", () => {
    const closes = Array.from({ length: 120 }, () => 100);
    const reading = detectSpectralCycle(makeBars(closes));
    expect(reading.active).toBe(false);
  });

  it("does not falsely detect a cycle in a pure linear trend with no periodicity", () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + 0.3 * i);
    const reading = detectSpectralCycle(makeBars(closes));
    expect(reading.active).toBe(false);
  });
});
