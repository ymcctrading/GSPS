import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLatestPrices } from "@/lib/data/alpaca";
import { __resetMarketDataCache } from "@/lib/data/http";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("fetchLatestPrices", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetMarketDataCache();
    process.env.ALPACA_API_KEY = "k";
    process.env.ALPACA_API_SECRET = "s";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads many stocks in one request and leaves out a symbol with no trade", async () => {
    fetchMock.mockImplementation(() => json({ trades: { AAPL: { p: 230.5 }, MSFT: { p: 410 } } }));
    const prices = await fetchLatestPrices(["aapl", "MSFT", "NOPE", "AAPL"], "us_equity");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/stocks/trades/latest");
    expect(url.searchParams.get("symbols")).toBe("AAPL,MSFT,NOPE");
    expect(url.searchParams.get("feed")).toBe("iex");
    expect([...prices]).toEqual([
      ["AAPL", 230.5],
      ["MSFT", 410],
    ]);
  });

  it("splits more than 100 symbols across requests", async () => {
    fetchMock.mockImplementation(() => json({ trades: {} }));
    const symbols = Array.from({ length: 150 }, (_, i) => `S${i}`);
    await fetchLatestPrices(symbols, "us_equity");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads crypto pairs from the crypto endpoint under their own keys", async () => {
    fetchMock.mockImplementation(() => json({ trades: { "BTC/USD": { p: 67000 } } }));
    const prices = await fetchLatestPrices(["BTC/USD", "ETH/USD"], "crypto");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1beta3/crypto/us/latest/trades");
    expect(prices.get("BTC/USD")).toBe(67000);
    expect(prices.has("ETH/USD")).toBe(false);
  });

  it("reads one by one when the batch is refused, leaving out the symbol the feed refuses", async () => {
    fetchMock.mockImplementation((u: string) => {
      const syms = new URL(String(u)).searchParams.get("symbols") ?? "";
      if (syms.includes("BAD")) return json({ message: "invalid symbol: BAD" }, 400);
      return json({ trades: { [syms]: { p: 1 } } });
    });
    const prices = await fetchLatestPrices(["AAA", "BAD", "CCC"], "us_equity");
    expect([...prices.keys()]).toEqual(["AAA", "CCC"]);
  });
});
