import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { detectSpectralCycle } from "@/lib/gann/spectralCycle";
import {
  amplitudeModulation,
  bartelsTest,
  epochAveragedWave,
  labelHarmonics,
  periodConstancy,
  refinePeriod,
} from "@/lib/research/spectralEstimation";

const TAU = 2 * Math.PI;
const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c, l: c, c, v: 1 }));
const lcg = (s0: number) => {
  let seed = s0;
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
};
const sine = (n: number, period: number, amp = 1) => Array.from({ length: n }, (_, i) => amp * Math.sin((TAU * i) / period));

describe("CYC-09: a fractional period is not rounded to whole bars", () => {
  it("estimates an embedded 9.2-bar period within 1%, which the whole-bar grid cannot", () => {
    const closes = Array.from({ length: 240 }, (_, i) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / 9.2)));
    const integer = detectSpectralCycle(bars(closes)).dominantPeriodBars!;
    expect(Math.abs(integer - 9.2) / 9.2).toBeGreaterThan(0.01);
    const refined = refinePeriod(closes.map(Math.log), integer);
    expect(Math.abs(refined - 9.2) / 9.2).toBeLessThan(0.01);
  });
});

describe("CYC-05: constancy of period over up to five sections", () => {
  it("re-estimates a steady period in five sections and finds them in agreement", () => {
    const r = periodConstancy(sine(600, 20), 20)!;
    expect(r.estimates).toHaveLength(5);
    for (const e of r.estimates) expect(Math.abs(e - 20)).toBeLessThan(1);
    expect(r.consistent).toBe(true);
  });

  it("finds a period that drifts from 15 to 30 bars not constant", () => {
    let phase = 0;
    const values = Array.from({ length: 600 }, (_, i) => {
      phase += TAU / (15 + (15 * i) / 600);
      return Math.sin(phase);
    });
    const r = periodConstancy(values, 21)!;
    expect(r.consistent).toBe(false);
  });
});

describe("CYC-48: amplitude modulation by a longer cycle", () => {
  it("flags a 20-bar wave whose swing rises and falls with a 240-bar cycle", () => {
    const values = Array.from({ length: 480 }, (_, i) => (1 + 0.8 * Math.sin((TAU * i) / 240)) * Math.sin((TAU * i) / 20));
    expect(amplitudeModulation(values, 20)!.modulated).toBe(true);
  });

  it("does not flag a wave of constant swing", () => {
    const r = amplitudeModulation(sine(480, 20), 20)!;
    expect(r.modulated).toBe(false);
    expect(r.ratio).toBeLessThan(1.3);
  });
});

describe("CYC-11: the epoch-averaged wave shape", () => {
  it("reports a fast-rise, slow-fall wave as asymmetric, with the same shape in both halves", () => {
    // Rise over 4 bars, fall over 16.
    const values = Array.from({ length: 400 }, (_, i) => {
      const k = i % 20;
      return k < 4 ? k / 4 : 1 - (k - 4) / 16;
    });
    const r = epochAveragedWave(values, 20)!;
    expect(r.riseShare).toBeLessThanOrEqual(0.35);
    expect(r.asymmetric).toBe(true);
    expect(r.halvesCorrelation).toBeGreaterThan(0.9);
  });

  it("reads a sine as symmetric", () => {
    const r = epochAveragedWave(sine(400, 20), 20)!;
    expect(r.asymmetric).toBe(false);
  });
});

describe("CYC-12: Bartels' test", () => {
  it("gives a regular cycle in noise a tiny probability of chance", () => {
    const rnd = lcg(9);
    const values = Array.from({ length: 240 }, (_, i) => Math.sin((TAU * i) / 20) + (rnd() - 0.5));
    // With m vectors the smallest possible p is e^(−m); 12 cycles here.
    expect(bartelsTest(values, 20)!.p).toBeLessThan(1e-4);
  });

  it("holds about its nominal 5% error rate on white noise", () => {
    let hits = 0;
    for (let s = 1; s <= 200; s++) {
      const rnd = lcg(500 + s);
      if (bartelsTest(Array.from({ length: 240 }, () => rnd() - 0.5), 20)!.p < 0.05) hits++;
    }
    expect(hits / 200).toBeLessThanOrEqual(0.09);
  });
});

describe("CYC-50: a peak at a whole fraction of a stronger one", () => {
  it("labels the 10-bar peak of a non-linear response to a 20-bar sine as its harmonic", () => {
    const values = sine(240, 20).map((s) => s + s * s);
    const peaks = labelHarmonics(values);
    const ten = peaks.find((p) => Math.abs(p.period - 10) < 0.5)!;
    expect(ten).toBeDefined();
    expect(ten.harmonicOf).toEqual({ period: 20, order: 2 });
    expect(peaks.find((p) => Math.abs(p.period - 20) < 0.5)!.harmonicOf).toBeNull();
  });

  it("does not label an independent second cycle", () => {
    const a = sine(240, 20);
    const b = sine(240, 13, 0.6);
    const peaks = labelHarmonics(a.map((v, i) => v + b[i]));
    expect(peaks.find((p) => Math.abs(p.period - 13) < 0.5)!.harmonicOf).toBeNull();
  });
});
