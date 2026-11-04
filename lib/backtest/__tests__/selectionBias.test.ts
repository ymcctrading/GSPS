import { describe, expect, it } from "vitest";
import {
  blockBootstrapMeanCI,
  deflatedSharpe,
  expectedMaxSharpe,
  normalCdf,
  normalInv,
  probabilisticSharpe,
  seededRandom,
  sharpeStats,
} from "@/lib/backtest/selectionBias";

describe("normal helpers", () => {
  it("matches standard values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5);
    expect(normalInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalInv(0.01)).toBeCloseTo(-2.326348, 5);
    expect(normalInv(0.5)).toBeCloseTo(0, 9);
    expect(normalInv(0)).toBe(-Infinity);
    expect(Number.isNaN(normalInv(1.5))).toBe(true);
  });

  it("inverts the CDF across the range", () => {
    for (const p of [0.001, 0.02, 0.2, 0.5, 0.8, 0.98, 0.999]) expect(normalCdf(normalInv(p))).toBeCloseTo(p, 6);
  });
});

describe("sharpeStats", () => {
  it("reads mean, sd, skew and kurtosis", () => {
    const s = sharpeStats([1, 2, 3, 4, 5]);
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(s.skew).toBeCloseTo(0, 12);
    expect(s.kurtosis).toBeCloseTo(1.7, 12);
  });

  it("returns NaN Sharpe for a flat or too-short series", () => {
    expect(Number.isNaN(sharpeStats([0.01, 0.01, 0.01]).sharpe)).toBe(true);
    expect(Number.isNaN(sharpeStats([0.01]).sharpe)).toBe(true);
  });

  it("refuses non-finite returns", () => {
    expect(() => sharpeStats([0.01, NaN])).toThrow();
    expect(() => sharpeStats([0.01, Infinity])).toThrow();
  });
});

describe("deflated Sharpe", () => {
  // Bailey and López de Prado (2014), the paper's worked example: 100 trials,
  // annualised Sharpe variance 1/2, 1,250 daily observations, annualised
  // Sharpe 2.5, skewness −3, kurtosis 10, 250 sessions a year. The paper gives
  // the luck benchmark as 0.1132 a day and the DSR as 0.9004.
  it("reproduces the paper's worked example", () => {
    const sr0 = expectedMaxSharpe(100, 0.5 / 250);
    expect(sr0).toBeCloseTo(0.1132, 3);
    const dsr = probabilisticSharpe(2.5 / Math.sqrt(250), sr0, 1250, -3, 10);
    expect(dsr).toBeGreaterThan(0.895);
    expect(dsr).toBeLessThan(0.905);
  });

  it("is a coin flip when the Sharpe equals the benchmark", () => {
    expect(probabilisticSharpe(0.1, 0.1, 500, 0, 3)).toBeCloseTo(0.5, 7);
  });

  it("has no luck benchmark for one trial and a rising one with more", () => {
    expect(expectedMaxSharpe(1, 0.01)).toBe(0);
    expect(expectedMaxSharpe(10, 0.01)).toBeLessThan(expectedMaxSharpe(100, 0.01));
    expect(() => expectedMaxSharpe(0, 0.01)).toThrow();
    expect(() => expectedMaxSharpe(2.5, 0.01)).toThrow();
  });

  it("deflates more as the trial count grows", () => {
    const rand = seededRandom(7);
    const returns = Array.from({ length: 1000 }, () => 0.0005 + (rand() - 0.5) * 0.02);
    const few = deflatedSharpe(returns, 2, 0.0004);
    const many = deflatedSharpe(returns, 500, 0.0004);
    expect(many.dsr).toBeLessThan(few.dsr);
  });
});

describe("blockBootstrapMeanCI", () => {
  it("is reproducible from its seed", () => {
    const xs = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 0.01);
    expect(blockBootstrapMeanCI(xs, { seed: 3 })).toEqual(blockBootstrapMeanCI(xs, { seed: 3 }));
  });

  it("brackets the mean and widens when returns cluster", () => {
    const rand = seededRandom(11);
    const iid = Array.from({ length: 400 }, () => rand() - 0.5);
    // The same values sorted: one long losing run then one long winning run.
    const clustered = [...iid].sort((a, b) => a - b);
    const a = blockBootstrapMeanCI(iid, { block: 20 });
    const b = blockBootstrapMeanCI(clustered, { block: 20 });
    expect(a.lo).toBeLessThanOrEqual(a.mean);
    expect(a.hi).toBeGreaterThanOrEqual(a.mean);
    expect(b.hi - b.lo).toBeGreaterThan(a.hi - a.lo);
  });

  it("refuses a resample count below one", () => {
    expect(() => blockBootstrapMeanCI([1, 2, 3], { resamples: 0 })).toThrow();
  });

  it("handles an empty series", () => {
    expect(Number.isNaN(blockBootstrapMeanCI([]).mean)).toBe(true);
  });
});
