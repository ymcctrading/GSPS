import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { periodPrior, samePeriodAcrossSeries, waveShapeCorrelation, type SeriesCycle } from "@/lib/research/crossSeries";

const TAU = 2 * Math.PI;
const bars = (closes: number[], start = 0): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2020, 0, 1) + (start + i) * 86_400_000).toISOString(), o: c, h: c, l: c, c, v: 1 }));
const series = (symbol: string, period: number | null, schusterP: number | null = 0.01): SeriesCycle => ({ symbol, period, schusterP, minPeriod: 5, maxPeriod: 120 });

describe("CYC-14: the same period across series, with its chance rate", () => {
  it("counts the series on a shared period and says how often chance would match", () => {
    const r = samePeriodAcrossSeries([series("A", 40), series("B", 41), series("C", 39), series("D", 90), series("E", 12)])!;
    expect(r.matches.sort()).toEqual(["A", "B", "C"]);
    // ±5% on a log-uniform 5-120 band: ln(1.05/0.95)/ln(24) ≈ 0.031.
    expect(r.chanceRate).toBeCloseTo(Math.log(1.05 / 0.95) / Math.log(24), 3);
    expect(r.p).toBeLessThan(0.05);
  });

  it("reads two series that merely land near each other as not beyond chance", () => {
    const r = samePeriodAcrossSeries([series("A", 40), series("B", 41), series("C", 90), series("D", 12), series("E", 25)])!;
    expect(r.matches.length).toBe(2);
    expect(r.p).toBeGreaterThan(0.05);
  });
});

describe("CYC-16: a strong series' cycle as a prior for a weak related one", () => {
  it("raises the weak series' significance only when the periods match", () => {
    const index = series("SPY", 40, 0.001);
    const match = periodPrior(index, series("X", 41, 0.2));
    expect(match.periodsMatch).toBe(true);
    expect(match.combinedP!).toBeLessThan(0.2);
    const miss = periodPrior(index, series("Y", 70, 0.2));
    expect(miss.periodsMatch).toBe(false);
    expect(miss.combinedP).toBe(0.2);
  });
});

describe("CYC-17: the same wave shape across series", () => {
  it("correlates two series that share a shape and not two whose shapes oppose", () => {
    const a = bars(Array.from({ length: 200 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20))));
    const same = bars(Array.from({ length: 200 }, (_, i) => 50 * Math.exp(0.03 * Math.sin((TAU * i) / 20))));
    const opposite = bars(Array.from({ length: 200 }, (_, i) => 50 * Math.exp(-0.03 * Math.sin((TAU * i) / 20))));
    expect(waveShapeCorrelation(a, same, 20)!.correlation).toBeGreaterThan(0.95);
    expect(waveShapeCorrelation(a, opposite, 20)!.correlation).toBeLessThan(-0.95);
  });

  it("aligns the two series on their dates, not their positions", () => {
    const a = bars(Array.from({ length: 200 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20))));
    // Starts 5 bars later but is the same wave on the calendar.
    const late = bars(Array.from({ length: 195 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((TAU * (i + 5)) / 20))), 5);
    expect(waveShapeCorrelation(a, late, 20)!.correlation).toBeGreaterThan(0.95);
  });
});
