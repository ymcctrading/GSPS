import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { validateCycle } from "../spectralCycle";

const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c, l: c, c, v: 1000 }));

const TAU = 2 * Math.PI;
/** A 5% cycle of `period` bars. */
const cycle = (n: number, period = 20, phase = 0) => Array.from({ length: n }, (_, i) => 100 * Math.exp(0.05 * Math.sin((TAU * i) / period + phase)));

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomWalk(n: number, seed = 7): number[] {
  const r = prng(seed);
  let x = 0;
  return Array.from({ length: n }, () => {
    // Sum of uniforms: near-normal steps of about 1%.
    x += ((r() + r() + r() + r() - 2) / 1.15) * 0.01;
    return 100 * Math.exp(x);
  });
}

describe("CYC-46: homogeneity is checked before any cycle is reported", () => {
  it("passes a steady series and flags one whose noise changes scale, reporting nothing else", () => {
    expect(validateCycle(bars(cycle(300))).homogeneity.homogeneous).toBe(true);
    const r = prng(3);
    let x = 0;
    const mixed = Array.from({ length: 300 }, (_, i) => {
      x += (r() - 0.5) * (i < 150 ? 0.002 : 0.15);
      return 100 * Math.exp(x + 0.05 * Math.sin((TAU * i) / 20));
    });
    const v = validateCycle(bars(mixed));
    expect(v.homogeneity.homogeneous).toBe(false);
    expect(v.periodCi).toBeNull();
    expect(v.intervalRandomness).toBeNull();
  });
});

describe("CYC-34 / CYC-45: the period carries its uncertainty, and its error on the hold-out", () => {
  it("gives a narrow interval around the true period, wider on a shorter window", () => {
    const long = validateCycle(bars(cycle(400))).periodCi!;
    expect(long[0]).toBeLessThanOrEqual(20);
    expect(long[1]).toBeGreaterThanOrEqual(20);
    const short = validateCycle(bars(cycle(120))).periodCi!;
    expect(short[1] - short[0]).toBeGreaterThan(long[1] - long[0]);
  });

  it("measures almost no period error on the unseen 30%", () => {
    expect(validateCycle(bars(cycle(300))).holdoutPeriodError).toBeLessThanOrEqual(0.05);
  });
});

describe("CYC-10: an interior block, withheld, is predicted by the fit around it", () => {
  it("correlates with the withheld block, better than other periods would", () => {
    const h = validateCycle(bars(cycle(300))).interiorHoldout!;
    expect(h.correlation).toBeGreaterThan(0.9);
    expect(h.nullP).toBeLessThan(0.05);
  });
});

describe("CYC-06 / CYC-22: phase resumes after a distortion, and forced versus free", () => {
  it("finds the shock and sees the crests return on the old phase", () => {
    const shifted = cycle(300).map((c, i) => (i >= 150 ? c * 1.4 : c));
    const v = validateCycle(bars(shifted));
    expect(v.phaseResumption?.shockStart).toBeGreaterThan(120);
    expect(v.phaseResumption?.shockStart).toBeLessThan(160);
    expect(v.phaseResumption?.resumed).toBe(true);
    expect(v.forcedOrFree).toBe("forced");
  });

  it("reads a cycle that comes back on a new phase as free", () => {
    const flipped = cycle(300).map((c, i) => (i >= 150 ? 1.4 * 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20 + Math.PI)) : c));
    const v = validateCycle(bars(flipped));
    expect(v.phaseResumption?.resumed).toBe(false);
    expect(v.forcedOrFree).toBe("free");
  });
});

describe("CYC-22: a cycle that persists but comes back on a new phase is still free", () => {
  it("needs both persistence and phase resumption to read forced", () => {
    // The 20-bar cycle dominates the whole window (it persists), but the
    // crests return half a period off after the shock: a flip at a crest (bar
    // 445), with no level shift to swamp the spectrum.
    const late = cycle(600).map((c, i) => (i >= 445 ? 100 * Math.exp(0.05 * Math.sin((TAU * i) / 20 + Math.PI)) : c));
    const v = validateCycle(bars(late));
    expect(v.period).toBe(20);
    expect(v.phaseResumption?.resumed).toBe(false);
    expect(v.forcedOrFree).toBe("free");
  });
});

describe("CYC-25 / CYC-26: crest spacing is tested against chance, and scored for regularity", () => {
  it("rejects random spacing for a real cycle and scores it fully regular", () => {
    const v = validateCycle(bars(cycle(300)));
    expect(v.intervalRandomness!.p).toBeLessThan(0.05);
    expect(v.regularityPct).toBe(100);
  });

  it("scores swings of random length as less regular", () => {
    // Swings of 8 to 40 bars: crests with no fixed rhythm.
    const r = prng(11);
    const closes: number[] = [];
    while (closes.length < 400) {
      const len = 8 + Math.floor(r() * 33);
      for (let k = 0; k < len; k++) closes.push(100 * Math.exp(0.05 * Math.sin((TAU * k) / len)));
    }
    expect(validateCycle(bars(closes.slice(0, 400))).regularityPct!).toBeLessThan(100);
  });

  it("rejects random spacing on random walks no more often than chance allows", () => {
    // The null is a random walk. A random walk's peak is usually at the longest
    // periods, leaving too few crests to test; across 40 of them, the testable
    // ones should be rejected at about the 5% rate.
    const ps = Array.from({ length: 40 }, (_, k) => validateCycle(bars(randomWalk(600, 100 + k))).intervalRandomness)
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => x.p);
    expect(ps.length).toBeGreaterThanOrEqual(8);
    expect(ps.filter((p) => p < 0.05).length).toBeLessThanOrEqual(2);
    // 40 full validations with 99 surrogates each: slow under full-suite load.
  }, 30_000);
});

describe("CYC-37: two near-equal periods beat", () => {
  it("reports the two periods and their beat period", () => {
    // 880 bars = four beat periods, so both halves see the same envelope.
    const closes = Array.from({ length: 880 }, (_, i) => 100 * Math.exp(0.03 * Math.sin((TAU * i) / 20) + 0.03 * Math.sin((TAU * i) / 22)));
    const b = validateCycle(bars(closes)).beats!;
    expect(b.periods[0]).toBeCloseTo(20, 0);
    expect(b.periods[1]).toBeCloseTo(22, 0);
    expect(Math.abs(b.beatPeriod - 220) / 220).toBeLessThan(0.1);
  });

  it("reports no beating for a single period", () => {
    expect(validateCycle(bars(cycle(600))).beats).toBeNull();
  });
});

describe("validateCycle is research only", () => {
  it("always marks its result a hypothesis", () => {
    expect(validateCycle(bars(cycle(300))).hypothesisOnly).toBe(true);
  });
});
