/**
 * The platform-wide liquidity floor. The scanners rank on structure, which
 * knows nothing about whether a fill is achievable, so this is the only thing
 * standing between a sub-$1 name and the same list as a megacap.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  MIN_CRYPTO_AVG_DOLLAR_VOLUME,
  MIN_EQUITY_AVG_VOLUME,
  MIN_EQUITY_PRICE_USD,
  meetsLiquidityFloor,
  readLiquidity,
} from "@/lib/scan/liquidity";

function bars(close: number, volume: number, count = 30): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
    o: close,
    h: close,
    l: close,
    c: close,
    v: volume,
  }));
}

describe("readLiquidity", () => {
  it("reads the last close and the mean volume of the lookback window", () => {
    const read = readLiquidity(bars(50, 1_000_000))!;
    expect(read.price).toBe(50);
    expect(read.avgVolume).toBeCloseTo(1_000_000, 6);
    expect(read.avgDollarVolume).toBeCloseTo(50_000_000, 6);
  });

  it("returns null when there are no usable bars to average", () => {
    expect(readLiquidity([])).toBeNull();
  });
});

describe("meetsLiquidityFloor", () => {
  it("passes a liquid equity", () => {
    expect(meetsLiquidityFloor(readLiquidity(bars(100, 5_000_000)), "us_equity").ok).toBe(true);
  });

  it("fails a penny stock however much of it trades", () => {
    const verdict = meetsLiquidityFloor(
      readLiquidity(bars(MIN_EQUITY_PRICE_USD - 0.01, 50_000_000)),
      "us_equity",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("below the $5 floor");
  });

  it("fails a thinly traded equity above the price floor", () => {
    const verdict = meetsLiquidityFloor(
      readLiquidity(bars(80, MIN_EQUITY_AVG_VOLUME - 1)),
      "us_equity",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("a day");
  });

  it("judges crypto on dollar turnover, with no price floor", () => {
    // A sub-$5 coin with real turnover passes; share price says nothing here.
    const cheap = readLiquidity(bars(0.5, 100_000_000));
    expect(meetsLiquidityFloor(cheap, "crypto").ok).toBe(true);

    const thin = readLiquidity(bars(0.5, 1_000));
    expect(meetsLiquidityFloor(thin, "crypto").ok).toBe(false);
    expect(meetsLiquidityFloor(thin, "crypto").reason).toContain("turnover");
  });

  it("fails an unreadable symbol rather than passing it silently", () => {
    const verdict = meetsLiquidityFloor(null, "us_equity");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("history");
  });

  it("holds the crypto floor exactly at the boundary", () => {
    const at = { price: 1, avgVolume: MIN_CRYPTO_AVG_DOLLAR_VOLUME, avgDollarVolume: MIN_CRYPTO_AVG_DOLLAR_VOLUME };
    expect(meetsLiquidityFloor(at, "crypto").ok).toBe(true);
    expect(
      meetsLiquidityFloor({ ...at, avgDollarVolume: MIN_CRYPTO_AVG_DOLLAR_VOLUME - 1 }, "crypto").ok,
    ).toBe(false);
  });
});
