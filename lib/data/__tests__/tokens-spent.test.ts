import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMarketDataCache, endpointKey, fetchWithRetry, tokensSpentSince, tokensSpentSnapshot } from "@/lib/data/http";

describe("endpointKey", () => {
  it("collapses a symbol in the path and keeps the bar timeframe", () => {
    expect(endpointKey("https://data.alpaca.markets/v2/stocks/AAPL/trades/latest?feed=iex")).toBe(
      "/v2/stocks/*/trades/latest",
    );
    expect(endpointKey("https://data.alpaca.markets/v2/stocks/BRK.B/snapshot")).toBe("/v2/stocks/*/snapshot");
    expect(endpointKey("https://data.alpaca.markets/v2/stocks/bars?symbols=A,B&timeframe=1Hour")).toBe(
      "/v2/stocks/bars 1Hour",
    );
    expect(endpointKey("https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=BTC%2FUSD")).toBe(
      "/v1beta3/crypto/us/latest/trades",
    );
  });
});

describe("tokens spent", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetMarketDataCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("counts one token per attempt, by endpoint, since a snapshot", async () => {
    const before = tokensSpentSnapshot();
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const opts = { provider: "Test", baseDelayMs: 1, maxDelayMs: 1 };
    await fetchWithRetry("https://x.test/v2/stocks/bars?timeframe=1Day", {}, opts);
    await fetchWithRetry("https://x.test/v2/stocks/AAPL/trades/latest", {}, opts);
    await fetchWithRetry("https://x.test/v2/stocks/MSFT/trades/latest", {}, opts);
    expect(tokensSpentSince(before)).toBe("Test /v2/stocks/bars 1Day=2, Test /v2/stocks/*/trades/latest=2");
  });
});
