import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { detectSpectralCycle } from "@/lib/gann/spectralCycle";
import {
  AWODELE_BAND_CONFLICT,
  awodeleHarmonicAnalysis,
  compositeHoldout,
  glidingPeriodogram,
  weeklyMidpointBars,
} from "@/lib/research/harmonicAnalysis";

const TAU = 2 * Math.PI;
const lcg = (s0: number) => {
  let seed = s0;
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
};

describe("C-TIME-32: the published Fourier recipe", () => {
  it("sets A0 to the mean, tries periods 3 to half the record on whole cycles, and ranks by a² + b²", () => {
    const x = Array.from({ length: 72 }, (_, t) => 41 + 3 * Math.cos((TAU * t) / 8) + 2 * Math.sin((TAU * t) / 8));
    const r = awodeleHarmonicAnalysis(x);
    expect(r.a0).toBeCloseTo(x.reduce((s, v) => s + v, 0) / 72, 9);
    expect(r.periods[0].period).toBe(8);
    expect(r.periods[0].a).toBeCloseTo(3, 6);
    expect(r.periods[0].b).toBeCloseTo(2, 6);
    expect(r.periods[0].power).toBeCloseTo(13, 6);
    const byT = new Map(r.periods.map((p) => [p.period, p]));
    expect(Math.min(...byT.keys())).toBe(3);
    expect(Math.max(...byT.keys())).toBe(36);
    // N trimmed to whole cycles: 14 cycles of 5 is 70 of the 72.
    expect(byT.get(5)!.n).toBe(70);
    expect(AWODELE_BAND_CONFLICT).toMatch(/repetitions/);
  });
});

describe("C-TIME-33: a composite of dominant periods, projected forward and scored", () => {
  const composite = (n: number) =>
    Array.from({ length: n }, (_, i) => 0.03 * Math.sin((TAU * i) / 17) + 0.025 * Math.sin((TAU * i) / 29) + 0.02 * Math.sin((TAU * i) / 45 + 1));

  it("picks the periods on the first 70% and carries their sum into the last 30%, beating a null", () => {
    const r = compositeHoldout(composite(400))!;
    for (const p of [17, 29, 45]) expect(r.periods.some((q) => Math.abs(q - p) <= 1)).toBe(true);
    expect(r.correlation).toBeGreaterThan(0.8);
    expect(r.nullP).toBeLessThanOrEqual(0.05);
    expect(r.passes).toBe(true);
  });

  it("rarely passes on noise", () => {
    let passes = 0;
    for (let s = 1; s <= 40; s++) {
      const rnd = lcg(70 + s);
      if (compositeHoldout(Array.from({ length: 400 }, () => rnd() - 0.5), { seed: s })!.passes) passes++;
    }
    expect(passes / 40).toBeLessThanOrEqual(0.15);
  });
});

describe("C-TIME-34: the weekly (high + low) / 2 series", () => {
  it("finds the same embedded period on the weekly midpoint as on weekly closes", () => {
    const daily: Bar[] = [];
    const start = Date.UTC(2020, 0, 6); // a Monday
    for (let w = 0; w < 200; w++) {
      for (let d = 0; d < 5; d++) {
        const c = 100 * Math.exp(0.05 * Math.sin((TAU * w) / 20)) + (d - 2) * 0.1;
        daily.push({ t: new Date(start + (w * 7 + d) * 86_400_000).toISOString(), o: c, h: c + 0.6, l: c - 0.4, c, v: 1 });
      }
    }
    const weekly = weeklyMidpointBars(daily);
    expect(weekly).toHaveLength(200);
    expect(weekly[0].c).toBeCloseTo((weekly[0].h + weekly[0].l) / 2, 9);
    const closes = weekly.map((b, i) => ({ ...b, c: daily[i * 5 + 4].c }));
    const onMid = detectSpectralCycle(weekly).dominantPeriodBars!;
    const onClose = detectSpectralCycle(closes).dominantPeriodBars!;
    expect(Math.abs(onMid - 20)).toBeLessThanOrEqual(1);
    expect(onMid).toBe(onClose);
  });
});

describe("CYC-36: a gliding periodogram", () => {
  it("reports a 20-bar period early and a 30-bar period late when the cycle changes", () => {
    let phase = 0;
    const values = Array.from({ length: 600 }, (_, i) => {
      phase += TAU / (i < 300 ? 20 : 30);
      return Math.sin(phase);
    });
    const g = glidingPeriodogram(values, 150, 50);
    expect(Math.abs(g[0].period - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(g[g.length - 1].period - 30)).toBeLessThanOrEqual(1);
  });
});
