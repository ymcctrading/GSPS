import { describe, expect, it } from "vitest";
import {
  isLargeCapStock,
  LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME,
  LARGE_CAP_PROXY_MIN_PRICE_USD,
} from "@/lib/strat/large-cap";

describe("isLargeCapStock", () => {
  it("is true for a known mega-cap symbol regardless of liquidity", () => {
    expect(isLargeCapStock("MSFT", "us_equity", null)).toBe(true);
    expect(isLargeCapStock("msft", "us_equity", null)).toBe(true); // case-insensitive
  });

  it("is true for an unlisted symbol that clears the price-and-turnover proxy", () => {
    const liquidity = {
      price: LARGE_CAP_PROXY_MIN_PRICE_USD,
      avgVolume: 10_000_000,
      avgDollarVolume: LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME,
    };
    expect(isLargeCapStock("NOTAREALLARGECAP", "us_equity", liquidity)).toBe(true);
  });

  it("is false for an unlisted symbol under either half of the proxy", () => {
    const belowPrice = { price: LARGE_CAP_PROXY_MIN_PRICE_USD - 1, avgVolume: 10_000_000, avgDollarVolume: LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME };
    const belowTurnover = { price: LARGE_CAP_PROXY_MIN_PRICE_USD, avgVolume: 1, avgDollarVolume: LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME - 1 };
    expect(isLargeCapStock("SMALLCO", "us_equity", belowPrice)).toBe(false);
    expect(isLargeCapStock("SMALLCO", "us_equity", belowTurnover)).toBe(false);
  });

  it("is false for an unlisted symbol with no liquidity read", () => {
    expect(isLargeCapStock("UNKNOWN", "us_equity", null)).toBe(false);
    expect(isLargeCapStock("UNKNOWN", "us_equity", undefined)).toBe(false);
  });

  it("is always false for crypto, even a known symbol reused as a pair", () => {
    expect(isLargeCapStock("MSFT", "crypto", null)).toBe(false);
    const liquidity = { price: 100_000, avgVolume: 1, avgDollarVolume: 1_000_000_000 };
    expect(isLargeCapStock("BTC/USD", "crypto", liquidity)).toBe(false);
  });
});
