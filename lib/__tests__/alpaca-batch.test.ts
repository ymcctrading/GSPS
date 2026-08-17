import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["ALPACA_API_KEY", "ALPACA_API_SECRET"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.ALPACA_API_KEY = "test-key";
  process.env.ALPACA_API_SECRET = "test-secret";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("fetchBarsBatch", () => {
  it("fetches many symbols in one request and keys results by symbol", async () => {
    const { fetchBarsBatch } = await import("@/lib/data/alpaca");
    const { __resetMarketDataCache } = await import("@/lib/data/http");
    __resetMarketDataCache();

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(url);
      expect(u.searchParams.get("symbols")).toBe("AAPL,MSFT");
      return new Response(
        JSON.stringify({
          bars: {
            AAPL: [{ t: "2026-08-10T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }],
            MSFT: [{ t: "2026-08-10T00:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 200 }],
          },
          next_page_token: null,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBarsBatch(
      ["aapl", "msft"],
      "1Day",
      new Date("2026-01-01"),
      new Date("2026-08-01"),
      "us_equity",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.get("AAPL")).toEqual([
      { t: "2026-08-10T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 },
    ]);
    expect(result.get("MSFT")).toEqual([
      { t: "2026-08-10T00:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 200 },
    ]);
  });

  it("pages through a multi-symbol response instead of dropping symbols past the first page", async () => {
    // Alpaca's `limit` on a multi-symbol bars request is a TOTAL across every
    // symbol in the request, sorted symbol-then-timestamp — not a per-symbol
    // cap. A single page can legitimately cover only the first symbol(s) and
    // return nothing at all for the rest, which is exactly what silently
    // gutted the market scan's candidate pool: most symbols came back with
    // zero bars and were treated as having insufficient data. Draining
    // next_page_token must recover every symbol's full bar set.
    const { fetchBarsBatch } = await import("@/lib/data/alpaca");
    const { __resetMarketDataCache } = await import("@/lib/data/http");
    __resetMarketDataCache();

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(url);
      const pageToken = u.searchParams.get("page_token");
      if (!pageToken) {
        // First page: only AAPL fit before the limit was reached.
        return new Response(
          JSON.stringify({
            bars: { AAPL: [{ t: "2026-08-10T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] },
            next_page_token: "page-2",
          }),
          { status: 200 },
        );
      }
      expect(pageToken).toBe("page-2");
      // Second page: the rest of the symbols.
      return new Response(
        JSON.stringify({
          bars: { MSFT: [{ t: "2026-08-10T00:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 200 }] },
          next_page_token: null,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBarsBatch(
      ["AAPL", "MSFT"],
      "1Day",
      new Date("2026-01-01"),
      new Date("2026-08-01"),
      "us_equity",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.get("AAPL")).toEqual([
      { t: "2026-08-10T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 },
    ]);
    expect(result.get("MSFT")).toEqual([
      { t: "2026-08-10T00:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 200 },
    ]);
  });

  it("returns an empty map without a request for an empty symbol list", async () => {
    const { fetchBarsBatch } = await import("@/lib/data/alpaca");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBarsBatch([], "1Day", new Date("2026-01-01"), null, "us_equity");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
