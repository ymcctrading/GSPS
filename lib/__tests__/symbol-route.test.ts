/**
 * `/ticker/BTC/USD` was two path segments against a one-segment route, so every
 * link to a crypto pair 404'd. These pin the round trip both ways.
 */

import { describe, expect, it } from "vitest";
import { tickerHref } from "@/lib/utils";
import { symbolFromRoute } from "@/lib/market/symbol-route";

describe("tickerHref", () => {
  it("keeps a crypto pair inside a single path segment", () => {
    expect(tickerHref("BTC/USD")).toBe("/ticker/BTC-USD");
  });

  it("leaves an ordinary ticker alone", () => {
    expect(tickerHref("AAPL")).toBe("/ticker/AAPL");
  });

  it("escapes anything else that would break the path", () => {
    expect(tickerHref("BRK.B")).toBe("/ticker/BRK.B");
  });
});

describe("symbolFromRoute", () => {
  it("restores the pair separator on a crypto symbol", () => {
    expect(symbolFromRoute("BTC-USD")).toBe("BTC/USD");
  });

  it("round-trips every crypto pair the app links to", () => {
    for (const symbol of ["BTC/USD", "ETH/USD", "SOL/USD"]) {
      const segment = tickerHref(symbol).replace("/ticker/", "");
      expect(symbolFromRoute(segment)).toBe(symbol);
    }
  });

  it("does not rewrite a hyphen that belongs to an equity ticker", () => {
    expect(symbolFromRoute("BRK-B")).toBe("BRK-B");
  });

  it("uppercases a lowercased URL", () => {
    expect(symbolFromRoute("aapl")).toBe("AAPL");
  });
});
