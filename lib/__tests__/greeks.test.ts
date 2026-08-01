import { describe, it, expect } from "vitest";
import {
  blackScholesPrice,
  computeGreeks,
  impliedVolatility,
  normCdf,
  yearsBetween,
} from "@/lib/options/greeks";

describe("normCdf", () => {
  it("matches known standard-normal values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 3);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 2);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 2);
  });
});

describe("blackScholesPrice", () => {
  it("is worth intrinsic value at expiry", () => {
    expect(blackScholesPrice("call", 110, 100, 0, 0.3)).toBeCloseTo(10);
    expect(blackScholesPrice("call", 90, 100, 0, 0.3)).toBeCloseTo(0);
    expect(blackScholesPrice("put", 90, 100, 0, 0.3)).toBeCloseTo(10);
  });

  it("prices an ATM call and put roughly equally (put-call symmetry at zero rates)", () => {
    const call = blackScholesPrice("call", 100, 100, 30 / 365, 0.25);
    const put = blackScholesPrice("put", 100, 100, 30 / 365, 0.25);
    expect(call).toBeCloseTo(put, 6);
  });

  it("increases with volatility, all else equal", () => {
    const low = blackScholesPrice("call", 100, 100, 30 / 365, 0.15);
    const high = blackScholesPrice("call", 100, 100, 30 / 365, 0.45);
    expect(high).toBeGreaterThan(low);
  });
});

describe("computeGreeks", () => {
  it("gives a deep ITM call delta near 1 and deep OTM near 0", () => {
    const itm = computeGreeks("call", 200, 100, 30 / 365, 0.3);
    const otm = computeGreeks("call", 50, 100, 30 / 365, 0.3);
    expect(itm.delta).toBeGreaterThan(0.9);
    expect(otm.delta).toBeLessThan(0.1);
  });

  it("keeps put delta negative and bounded in [-1, 0]", () => {
    const g = computeGreeks("put", 100, 100, 30 / 365, 0.3);
    expect(g.delta).toBeLessThan(0);
    expect(g.delta).toBeGreaterThanOrEqual(-1);
  });

  it("gamma and vega are positive for both calls and puts", () => {
    for (const side of ["call", "put"] as const) {
      const g = computeGreeks(side, 100, 100, 30 / 365, 0.3);
      expect(g.gamma).toBeGreaterThan(0);
      expect(g.vega).toBeGreaterThan(0);
    }
  });

  it("theta is negative for a long option (time decay)", () => {
    const g = computeGreeks("call", 100, 100, 30 / 365, 0.3);
    expect(g.theta).toBeLessThan(0);
  });

  it("returns zeroed greeks and a binary delta at expiry", () => {
    expect(computeGreeks("call", 110, 100, 0, 0.3)).toEqual({ delta: 1, gamma: 0, theta: 0, vega: 0 });
    expect(computeGreeks("call", 90, 100, 0, 0.3)).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
  });
});

describe("impliedVolatility", () => {
  it("round-trips: pricing at a known sigma and solving recovers it", () => {
    const spot = 100;
    const strike = 105;
    const t = 45 / 365;
    const trueSigma = 0.35;
    const price = blackScholesPrice("call", spot, strike, t, trueSigma);
    const solved = impliedVolatility("call", spot, strike, t, price);
    expect(solved).toBeCloseTo(trueSigma, 2);
  });

  it("returns 0 for an expired or non-positive price", () => {
    expect(impliedVolatility("call", 100, 100, 0, 5)).toBe(0);
    expect(impliedVolatility("call", 100, 100, 0.1, 0)).toBe(0);
  });
});

describe("yearsBetween", () => {
  it("converts a day span to a year fraction", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T00:00:00.000Z");
    expect(yearsBetween(from, to)).toBeCloseTo(30 / 365, 6);
  });

  it("floors at one day so same-day/past expirations don't divide by zero", () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    const to = new Date("2026-01-01T18:00:00.000Z");
    expect(yearsBetween(from, to)).toBeCloseTo(1 / 365, 6);
    const past = new Date("2025-01-01T00:00:00.000Z");
    expect(yearsBetween(from, past)).toBeCloseTo(1 / 365, 6);
  });
});
