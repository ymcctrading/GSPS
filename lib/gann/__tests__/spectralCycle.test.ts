import { describe, expect, it } from "vitest";
import { detectSpectralCycle, fitCosinor, MIN_REPETITIONS, schusterAlpha } from "../spectralCycle";
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

describe("F3 cycle checks: cosinor, artifact guards, hold-out", () => {
  const bars = (closes: number[]) =>
    closes.map((c, i) => ({ t: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 }));

  it("measures a 5% cycle's amplitude, with an interval that contains it", () => {
    // 5% swing in price: log amplitude ≈ 0.05.
    const r = detectSpectralCycle(bars(Array.from({ length: 240 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((2 * Math.PI * i) / 20)))));
    expect(r.cosinor).not.toBeNull();
    expect(r.cosinor!.amplitudePct).toBeCloseTo(5, 0);
    expect(r.cosinor!.amplitudeCiPct[0]).toBeLessThanOrEqual(5);
    expect(r.cosinor!.amplitudeCiPct[1]).toBeGreaterThanOrEqual(5);
    expect(r.cosinor!.zeroAmplitudeP).toBeLessThan(0.001);
  });

  it("carries a real cycle forward into the unseen 30% of the window", () => {
    const r = detectSpectralCycle(bars(Array.from({ length: 240 }, (_, i) => 100 + 5 * Math.sin((2 * Math.PI * i) / 20))));
    expect(r.holdout).not.toBeNull();
    expect(r.holdout!.trainPeriodBars).toBe(20);
    expect(r.holdout!.correlation).toBeGreaterThan(0.9);
    expect(r.windowStable).toBe(true);
    expect(r.atBandEdge).toBe(false);
  });

  it("does not call a curved trend's leftover a cycle", () => {
    const r = detectSpectralCycle(bars(Array.from({ length: 200 }, (_, i) => 50 + 0.002 * i * i)));
    expect(r.active).toBe(false);
  });

  // Schuster's test (review 22, CYC-51): n candidate frequencies make a peak n
  // times likelier by chance, so p = min(1, independent × e^(−dominance)),
  // with independent = round(n/5 − n/maxPeriod), 46 at 240 bars.
  it("scales Schuster's p by the number of independent frequencies, capped at 1", () => {
    const noise = (s0: number) => {
      let seed = s0;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      return makeBars(Array.from({ length: 240 }, () => 100 + 2 * (rnd() - 0.5)));
    };
    const r = detectSpectralCycle(noise(7));
    const expected = 46 * Math.exp(-(r.dominancePower ?? 0));
    expect(expected).toBeGreaterThan(0.01);
    expect(expected).toBeLessThan(1);
    expect(Math.abs((r.schusterP ?? -1) - expected)).toBeLessThanOrEqual(expected * 0.006 + 0.0006);
    expect(detectSpectralCycle(noise(11)).schusterP).toBe(1);
  });
});

// X4: chance is ruled out before a cycle is credited (Dewey, The Case for
// Cycles 1967; Halberg et al. 2003 on the cosinor). Context only.
describe("significance and hold-out before a cycle is credited", () => {
  const lcg = (s0: number) => {
    let seed = s0;
    return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  };
  const noiseBars = (s0: number, n = 240) => {
    const rnd = lcg(s0);
    return makeBars(Array.from({ length: n }, () => 100 + 2 * (rnd() - 0.5)));
  };

  // CYC-01: assume chance first.
  it("never reports a peak with Schuster p above 0.05 as active", () => {
    let dominantButChance = 0;
    for (let s = 1; s <= 60; s++) {
      const r = detectSpectralCycle(noiseBars(s));
      if ((r.dominancePower ?? 0) >= 3 && (r.schusterP ?? 1) > 0.05) dominantButChance++;
      if ((r.schusterP ?? 1) > 0.05) expect(r.active).toBe(false);
    }
    // The fixture must exercise the case: dominant peaks that chance explains.
    expect(dominantButChance).toBeGreaterThan(0);
  });

  // CYC-13: dominance alone never establishes non-chance.
  it("says chance was not ruled out when a dominant peak is not significant", () => {
    for (let s = 1; s <= 60; s++) {
      const r = detectSpectralCycle(noiseBars(s));
      if ((r.dominancePower ?? 0) >= 3 && (r.schusterP ?? 1) > 0.05 && !r.atBandEdge) {
        expect(r.active).toBe(false);
        expect(r.note).toMatch(/chance not ruled out/);
        return;
      }
    }
    throw new Error("no dominant-but-insignificant draw in the fixture");
  });

  // CYC-04: too few repetitions decides nothing.
  it("does not credit a strong peak with fewer than the minimum repetitions", () => {
    // A 60-bar cycle in 240 bars repeats 4 times, under the floor of 5.
    const closes = Array.from({ length: 240 }, (_, i) => 100 + 10 * Math.sin((2 * Math.PI * i) / 60));
    const r = detectSpectralCycle(makeBars(closes));
    expect(Math.abs((r.dominantPeriodBars ?? 0) - 60)).toBeLessThanOrEqual(2);
    expect(r.repetitionCount).toBeLessThan(MIN_REPETITIONS);
    expect(r.active).toBe(false);
  });

  // CYC-04: the repetitions floor alone blocks this one. A 50-bar sine in 240
  // bars is dominant and significant, off the band edge, but repeats 4.8 times.
  it("does not credit a dominant, significant peak that repeats under the floor", () => {
    const r = detectSpectralCycle(makeBars(Array.from({ length: 240 }, (_, i) => 100 + 10 * Math.sin((2 * Math.PI * i) / 50))));
    expect(r.dominancePower!).toBeCloseTo(8.76, 1);
    expect(r.schusterP!).toBeCloseTo(0.007, 3);
    expect(r.atBandEdge).toBe(false);
    expect(r.repetitionCount).toBe(4.8);
    expect(r.repetitionCount!).toBeLessThan(MIN_REPETITIONS);
    expect(r.active).toBe(false);
  });

  // CYC-27: short periods arise more easily by chance (W040 p.5), so a short
  // peak needs a smaller Schuster p.
  it("asks a 5-bar peak for a smaller Schuster p than a 40-bar peak", () => {
    expect(schusterAlpha(40)).toBe(0.05);
    expect(schusterAlpha(20)).toBe(0.05);
    expect(schusterAlpha(5)).toBeCloseTo(0.0125, 10);
    const peak = (period: number, amp: number) => {
      let seed = 7;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      return detectSpectralCycle(makeBars(Array.from({ length: 240 }, (_, i) => 100 + 2 * (rnd() - 0.5) + amp * Math.sin((2 * Math.PI * i) / period))));
    };
    const short = peak(5, 0.18);
    const long = peak(40, 0.2);
    // About the same Schuster p, both under 0.05.
    for (const r of [short, long]) {
      expect(r.schusterP!).toBeGreaterThan(0.02);
      expect(r.schusterP!).toBeLessThan(0.05);
      expect(r.atBandEdge).toBe(false);
    }
    expect(short.dominantPeriodBars).toBe(5);
    expect(short.active).toBe(false);
    expect(Math.abs(long.dominantPeriodBars! - 40)).toBeLessThanOrEqual(2);
    expect(long.active).toBe(true);
  });

  // CYC-08: decide on the first 70% alone, then test on the rest against a null.
  it("runs the hold-out from the first 70% even when the full window is not active, with a null", () => {
    const r = detectSpectralCycle(noiseBars(5));
    expect(r.active).toBe(false);
    expect(r.holdout).not.toBeNull();
    expect(r.holdout!.nullP).toBeGreaterThan(0);
    const real = detectSpectralCycle(makeBars(Array.from({ length: 240 }, (_, i) => 100 + 5 * Math.sin((2 * Math.PI * i) / 20))));
    expect(real.holdout!.trainPeriodBars).toBe(20);
    expect(real.holdout!.nullP).toBeLessThanOrEqual(0.05);
    expect(real.holdout!.carriedForward).toBe(true);
  });

  // CYC-32: zero-amplitude test, run where the period was fixed beforehand.
  it("tests a real cycle's amplitude on the unseen 30% at the period fitted on the first 70%", () => {
    const r = detectSpectralCycle(makeBars(Array.from({ length: 240 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((2 * Math.PI * i) / 20)))));
    expect(r.holdout!.zeroAmplitudeP).toBeLessThan(0.001);
  });

  // CYC-33: a cosinor at a period fixed beforehand keeps its nominal 5% error rate.
  it("keeps the hold-out zero-amplitude test near 5% false positives on noise", () => {
    let hits = 0;
    const draws = 200;
    for (let s = 1; s <= draws; s++) {
      const p = detectSpectralCycle(noiseBars(1000 + s)).holdout?.zeroAmplitudeP;
      expect(p).toBeDefined();
      if ((p ?? 1) < 0.05) hits++;
    }
    expect(hits / draws).toBeLessThanOrEqual(0.09);
  });
});

// CYC-31: Halberg's single cosinor, with the MESOR and acrophase each carrying a 95% interval.
describe("fitCosinor", () => {
  it("reports a MESOR and an acrophase whose intervals contain the fixture's mean and phase", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const period = 24;
    const values = Array.from({ length: 240 }, (_, t) => 3 + 0.5 * Math.cos((2 * Math.PI * t) / period - 1) + 0.4 * (rnd() - 0.5));
    const fit = fitCosinor(values, period)!;
    expect(fit.mesorCi[0]).toBeLessThanOrEqual(3);
    expect(fit.mesorCi[1]).toBeGreaterThanOrEqual(3);
    expect(fit.acrophaseCi[0]).toBeLessThanOrEqual(-1);
    expect(fit.acrophaseCi[1]).toBeGreaterThanOrEqual(-1);
    expect(fit.amplitudeCi[0]).toBeLessThanOrEqual(0.5);
    expect(fit.amplitudeCi[1]).toBeGreaterThanOrEqual(0.5);
    expect(fit.zeroAmplitudeP).toBeLessThan(0.001);
  });
});

// CYC-04: the 1935 list's longest cycles repeat too few times in any US equity record.
describe("repetition label on the yearly cycle list", () => {
  it("labels the 30-, 50- and 60-year cycles as too few repetitions to confirm", async () => {
    const { FEW_REPETITION_CYCLE_YEARS, MAJOR_CYCLE_YEARS } = await import("../timeCycles");
    expect([...FEW_REPETITION_CYCLE_YEARS]).toEqual([30, 50, 60]);
    for (const y of FEW_REPETITION_CYCLE_YEARS) expect(MAJOR_CYCLE_YEARS).toContain(y);
  });
});

describe("the null rate of an active cycle (CYC-28)", () => {
  // 100 seeded white-noise series and 100 seeded random walks, 240 bars each.
  // None holds a cycle, so an active reading on them is a false positive.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = 240;
  let noiseActive = 0;
  let walkActive = 0;
  for (let k = 0; k < 100; k++) {
    if (detectSpectralCycle(makeBars(Array.from({ length: n }, () => 100 * Math.exp(0.01 * gauss())))).active) noiseActive++;
    let p = 100;
    if (detectSpectralCycle(makeBars(Array.from({ length: n }, () => (p *= Math.exp(0.01 * gauss()))))).active) walkActive++;
  }

  it("calls a cycle on at most 5% of the noise series and walks together", () => {
    expect((noiseActive + walkActive) / 200).toBeLessThanOrEqual(0.05);
  });

  it("keeps each kind of null series under 10%", () => {
    expect(noiseActive).toBeLessThanOrEqual(10);
    expect(walkActive).toBeLessThanOrEqual(10);
  });
});

describe("persistence through changed conditions (CYC-07)", () => {
  // Dewey's item 6: a real cycle survives a change of regime. The split-half
  // check (`periodConsistent`) re-finds the period on each half of the window,
  // so a change at mid-series is the regime change it has to survive.
  const shifted = (cycleInSecondHalf: boolean) => {
    let seed = 99;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const n = 300;
    let drift = 0;
    return makeBars(
      Array.from({ length: n }, (_, i) => {
        const late = i >= n / 2;
        // The second half trends up and is three times as volatile.
        drift += late ? 0.002 : 0;
        const noise = (late ? 0.03 : 0.01) * (rnd() - 0.5);
        const cycle = !late || cycleInSecondHalf ? 0.05 * Math.sin((2 * Math.PI * i) / 20) : 0;
        return 100 * Math.exp(drift + cycle + noise);
      }),
    );
  };

  it("keeps the period when a 20-bar cycle runs on through a shift in drift and volatility", () => {
    const r = detectSpectralCycle(shifted(true));
    expect(r.periodConsistent).toBe(true);
    expect(r.dominantPeriodBars).toBe(20);
  });

  it("does not call the period constant when the cycle stops at the shift", () => {
    expect(detectSpectralCycle(shifted(false)).periodConsistent).toBe(false);
  });
});
