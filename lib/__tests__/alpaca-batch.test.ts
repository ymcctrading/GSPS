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

  it("splits a shortlist whose window fills two pages into chunks that each fit one, fetched side by side", async () => {
    // 50 equities x 7 days of 15-minute bars (about 320 each, extended hours
    // included) is ~16,000 bars: two sequential pages as one request, so the
    // full pass waited for two round trips. Split, each chunk is one page.
    const { fetchBarsBatch } = await import("@/lib/data/alpaca");
    const { __resetMarketDataCache } = await import("@/lib/data/http");
    __resetMarketDataCache();

    let inFlight = 0;
    let maxInFlight = 0;
    const requested: string[][] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(url);
      const syms = (u.searchParams.get("symbols") ?? "").split(",");
      requested.push(syms);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const bars = Object.fromEntries(syms.map((s) => [s, [{ t: "2026-08-10T14:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }]]));
      return new Response(JSON.stringify({ bars, next_page_token: null }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const symbols = Array.from({ length: 50 }, (_, i) => `S${i}`);
    const end = new Date("2026-08-10T20:00:00Z");
    const result = await fetchBarsBatch(symbols, "15Min", new Date(end.getTime() - 7 * 86_400_000), end, "us_equity");

    expect(requested.length).toBeGreaterThan(1);
    expect(requested.flat().sort()).toEqual([...symbols].sort());
    expect(maxInFlight).toBeGreaterThan(1);
    expect(result.size).toBe(50);
  });
});

describe("batchChunkSize", () => {
  const end = new Date("2026-10-22T20:00:00Z");
  const back = (days: number) => new Date(end.getTime() - days * 86_400_000);

  it("keeps a short window in one request of up to 100 symbols", async () => {
    const { batchChunkSize } = await import("@/lib/data/alpaca");
    expect(batchChunkSize("1Month", back(400), end, "us_equity", 10000)).toBe(100);
  });

  it("sizes each chunk to fit one 10,000-bar page", async () => {
    const { batchChunkSize } = await import("@/lib/data/alpaca");
    for (const [tf, days] of [
      ["15Min", 7],
      ["1Hour", 30],
      ["1Day", 365],
      ["1Week", 5 * 365 + 7],
    ] as const) {
      const size = batchChunkSize(tf, back(days), end, "us_equity", 10000);
      expect(size).toBeLessThan(100);
      // About 320, 343, 261 and 262 bars a symbol: a chunk stays under a page.
      const perDay = { "15Min": (64 * 5) / 7, "1Hour": (16 * 5) / 7, "1Day": 5 / 7, "1Week": 1 / 7 }[tf];
      expect(size * Math.ceil(days * perDay)).toBeLessThanOrEqual(10000);
    }
  });

  it("counts a monthly window only from 2016, where the history starts", async () => {
    const { batchChunkSize } = await import("@/lib/data/alpaca");
    const sixtyOne = batchChunkSize("1Month", back(61 * 365.25), end, "us_equity", 10000);
    const fromHistory = batchChunkSize("1Month", new Date(Date.UTC(2016, 0, 1)), end, "us_equity", 10000);
    expect(sixtyOne).toBe(fromHistory);
  });

  it("reads crypto's round-the-clock sessions", async () => {
    const { batchChunkSize } = await import("@/lib/data/alpaca");
    expect(batchChunkSize("15Min", back(7), end, "crypto", 10000)).toBeLessThan(
      batchChunkSize("15Min", back(7), end, "us_equity", 10000),
    );
  });
});
