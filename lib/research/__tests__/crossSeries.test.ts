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

describe("CYC-14: the p-value, exactly, with the Bonferroni factor", () => {
  const q = Math.log(1.05 / 0.95) / Math.log(24);
  it("is the binomial tail times the number of series", () => {
    const r = samePeriodAcrossSeries([series("A", 40), series("B", 41), series("C", 39), series("D", 90), series("E", 12)])!;
    // 2 of the 4 others match: P(X >= 2), X ~ Bin(4, q), times 5 series.
    const tail = 1 - (1 - q) ** 4 - 4 * q * (1 - q) ** 3;
    expect(r.p).toBeCloseTo(5 * tail, 4);
  });

  it("lets the correction move a lone match across 0.05", () => {
    // Uncorrected, one match in one other series is p = q ≈ 0.031; times 2 it is ≈ 0.063.
    const r = samePeriodAcrossSeries([series("A", 40), series("B", 41)])!;
    expect(q).toBeLessThan(0.05);
    expect(r.p).toBeCloseTo(2 * q, 4);
    expect(r.p).toBeGreaterThan(0.05);
  });
});

describe("CYC-16: Fisher's combination, exactly", () => {
  it("combines 0.001 and 0.2 to about 0.0019", () => {
    expect(periodPrior(series("SPY", 40, 0.001), series("X", 41, 0.2)).combinedP).toBeCloseTo(0.0019, 4);
  });
});

describe("CYC-17: the fold counts bars, not calendar days", () => {
  function weekdays(n: number, f: (i: number) => number): Bar[] {
    const out: Bar[] = [];
    for (let d = Date.UTC(2020, 0, 1); out.length < n; d += 86_400_000) {
      const wd = new Date(d).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const c = f(out.length);
      out.push({ t: new Date(d).toISOString(), o: c, h: c, l: c, c, v: 1 });
    }
    return out;
  }
  function prng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  it("finds a shared 20-bar wave on weekday-only bars under independent noise", () => {
    const ra = prng(1);
    const rb = prng(2);
    const a = weekdays(400, (i) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20) + (ra() - 0.5) * 0.3));
    const b = weekdays(400, (i) => 50 * Math.exp(0.05 * Math.sin((TAU * i) / 20) + (rb() - 0.5) * 0.3));
    // Folding by calendar days smears the wave (20 bars is 28 days) and reads about 0.4 here.
    expect(waveShapeCorrelation(a, b, 20)!.correlation).toBeGreaterThan(0.8);
  });
});

describe("CYC-15: synchrony within a lag window", () => {
  it("counts crests a few bars apart as synchronous, not only same-bar ones", async () => {
    const { crestSynchrony } = await import("@/lib/research/crossSeries");
    const f = (i: number) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20));
    const a = bars(Array.from({ length: 200 }, (_, i) => f(i)));
    const b = bars(Array.from({ length: 200 }, (_, i) => f(i - 3)));
    const r = crestSynchrony(a, b, 20, 4)!;
    expect(r.sameBarShare).toBeLessThan(0.2);
    expect(r.withinLagShare).toBeGreaterThanOrEqual(0.9);
    expect(r.meanLag).toBeCloseTo(3, 0);
  });
});

describe("CYC-49: the chance baseline for a doubling-and-tripling grid", () => {
  it("reports the share of random periods near the grid, and counts the periods that miss", async () => {
    const { gridMatchBaseline } = await import("@/lib/research/crossSeries");
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const random = Array.from({ length: 30 }, () => Math.exp(Math.log(1) + rnd() * Math.log(500)));
    const r = gridMatchBaseline(17.75, random, { minPeriod: 1, maxPeriod: 500 });
    // A dense grid: a large share of the band lies within ±5% of a grid period.
    expect(r.baseline).toBeGreaterThan(0.2);
    expect(r.baseline).toBeLessThan(0.6);
    expect(r.hits + r.misses).toBe(30);
    expect(r.misses).toBeGreaterThan(0);
    expect(r.p).toBeGreaterThan(0.05);
    const onGrid = gridMatchBaseline(17.75, [17.75, 35.5, 53.25, 8.875, 5.92, 106.5, 4.44, 71, 142, 159.75], { minPeriod: 1, maxPeriod: 500 });
    expect(onGrid.misses).toBe(0);
    expect(onGrid.p).toBeLessThan(0.05);
  });
});
