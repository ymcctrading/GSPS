/**
 * The full pass stops waiting for its shortlist's bars at
 * `FULL_PASS_FETCH_DEADLINE_MS` (40 s from the start of the scan) and scores
 * nothing, rather than holding the run into the route's 60 s limit (27
 * scheduled scan calls timed out that way on 2026-10-22).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, Timeframe } from "@/lib/types";

const { fetchBarsBatchMock, fetchAllMock, scanTickerMock, latestPricesMock } = vi.hoisted(() => ({
  latestPricesMock: vi.fn(),
  fetchBarsBatchMock: vi.fn(),
  fetchAllMock: vi.fn(),
  scanTickerMock: vi.fn(),
}));

vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({
    fetchBars: vi.fn(),
    fetchBarsBatch: fetchBarsBatchMock,
    fetchLatestPrices: latestPricesMock,
  }),
  fetchAllTimeframesBatch: fetchAllMock,
}));
vi.mock("@/lib/data/alpaca", () => ({ fetchMostActives: vi.fn(async () => []) }));
vi.mock("@/lib/scanTicker", () => ({ scanTicker: scanTickerMock }));
vi.mock("@/lib/brokers/alpaca", () => ({ envCreds: () => null, getAsset: vi.fn() }));

import { runMarketScan } from "@/lib/marketScan";
import { publishRefusal } from "@/lib/scan/publish";
import type { ScanResult } from "@/lib/types";

function daily(): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 120; i++) {
    const c = 150 - i * 0.5 + 6 * Math.sin((i / 10) * 2 * Math.PI) - (i >= 110 ? (i - 109) * 1.5 : 0);
    bars.push({ t: new Date(Date.UTC(2027, 0, 1 + i)).toISOString(), o: c, h: c * 1.01, l: c * 0.99, c, v: 1_000_000 });
  }
  return bars;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date(Date.UTC(2027, 6, 15)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scanTickerMock.mockImplementation(async (symbol: string) => ({ symbol, error: "not under test" }));
  latestPricesMock.mockImplementation(async () => new Map());
  fetchBarsBatchMock.mockImplementation(async (symbols: string[], timeframe: Timeframe) => {
    const bars = timeframe === "1Day" ? daily() : [];
    return new Map(symbols.map((s) => [s.toUpperCase(), bars]));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fetchBarsBatchMock.mockReset();
  fetchAllMock.mockReset();
  scanTickerMock.mockReset();
  latestPricesMock.mockReset();
});

const scoredAapl = () => scanTickerMock.mock.calls.some((c) => c[0] === "AAPL");

describe("runMarketScan full-pass fetch deadline", () => {
  it("scores the shortlist when its bars arrive in time", async () => {
    fetchAllMock.mockImplementation(async () => new Map());
    const run = runMarketScan(1, 15, undefined, ["AAPL"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await run;
    expect(scoredAapl()).toBe(true);
  });

  it("reads the latest prices in one batch per market and hands each scan its price", async () => {
    // 2026-10-22 20:15 UTC: 56 single price reads queued behind the shared
    // rate limiter during scoring until the run passed 60 s.
    fetchAllMock.mockImplementation(async () => new Map());
    latestPricesMock.mockImplementation(async (symbols: string[], assetClass: string) =>
      new Map(symbols.map((s) => [s.toUpperCase(), assetClass === "crypto" ? 67_000 : 230.5])),
    );
    const run = runMarketScan(1, 15, undefined, ["AAPL"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await run;
    const priceOf = (symbol: string) => scanTickerMock.mock.calls.find((c) => c[0] === symbol)?.[5];
    expect(priceOf("AAPL")).toBe(230.5);
    expect(priceOf("BTC/USD")).toBe(67_000);
    const stockReads = latestPricesMock.mock.calls.filter((c) => c[1] === "us_equity");
    expect(stockReads.some((c) => c[0].includes("AAPL"))).toBe(true);
  });

  it("lets each scan read its own price when the batched read fails", async () => {
    fetchAllMock.mockImplementation(async () => new Map());
    latestPricesMock.mockImplementation(async () => {
      throw new Error("429");
    });
    const run = runMarketScan(1, 15, undefined, ["AAPL"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await run;
    const aapl = scanTickerMock.mock.calls.find((c) => c[0] === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl?.[5]).toBeUndefined();
  });

  it("never asks the stock endpoints for a tracked crypto pair", async () => {
    // 2026-10-22 19:45 UTC: a tracked BCH/USD reached the stock batch and
    // Alpaca's stock bars refused the whole request, failing the scan.
    fetchAllMock.mockImplementation(async () => new Map());
    const run = runMarketScan(1, 15, undefined, ["BCH/USD", "AAPL"], ["BTC/USD"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await run;
    for (const [symbols] of fetchBarsBatchMock.mock.calls) {
      expect(symbols.filter((s: string) => s.includes("/"))).toEqual([]);
    }
    for (const [symbols, , assetClass] of fetchAllMock.mock.calls) {
      if (assetClass !== "crypto") expect(symbols.filter((s: string) => s.includes("/"))).toEqual([]);
    }
    expect(scoredAapl()).toBe(true);
  });

  it("scores nothing and returns once the fetch outruns 40 s", async () => {
    // Equities never answer; the side passes' crypto and funds calls hang too.
    fetchAllMock.mockImplementation(() => new Promise(() => {}));
    let done = false;
    const run = runMarketScan(1, 15, undefined, ["AAPL"]).then((out) => {
      done = true;
      return out;
    });
    await vi.advanceTimersByTimeAsync(39_000);
    expect(done).toBe(false);
    // The side passes' own deadline is 42 s; nothing else is waited for.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(done).toBe(true);
    const out = await run;
    expect(scoredAapl()).toBe(false);
    // Only the full pass and the two side passes asked for bars; the top-up didn't.
    expect(fetchAllMock).toHaveBeenCalledTimes(3);
    expect(out.bullish).toEqual([]);
    expect(out.bearish).toEqual([]);
  });

  it("reports the stocks unread, and is refused publishing, when crypto lists a plan while stock bars hang", async () => {
    // The crypto pass answers and arms a buy; the stock fetch never does. The
    // lists then hold crypto alone, and writing them would overwrite and prune
    // the day's stock rows (same scan_date, direction and rank key).
    fetchAllMock.mockImplementation((_symbols: string[], _tf: string, assetClass?: string) =>
      assetClass === "crypto" ? Promise.resolve(new Map()) : new Promise(() => {}),
    );
    scanTickerMock.mockImplementation(async (symbol: string) =>
      symbol === "BTC/USD"
        ? ({
            symbol,
            direction: "bullish",
            currentPrice: 100,
            decision: { outputState: "Execute", score: 7 },
            levels: { entry: 101, stopLoss: 95, takeProfit1: 110, masterProfit: 120 },
          } as unknown as ScanResult)
        : ({ symbol, error: "not under test" } as unknown as ScanResult),
    );
    const run = runMarketScan(1, 15, undefined, ["AAPL"]);
    await vi.advanceTimersByTimeAsync(45_000);
    const out = await run;
    expect(out.bullish.map((r) => r.symbol)).toContain("BTC/USD");
    expect(out.equitiesRead).toBe(false);
    expect(publishRefusal(out)).not.toBeNull();
  });

  it("lets a run whose stock bars arrived publish", async () => {
    fetchAllMock.mockImplementation(async () => new Map());
    const run = runMarketScan(1, 15, undefined, ["AAPL"]);
    await vi.advanceTimersByTimeAsync(60_000);
    const out = await run;
    expect(out.equitiesRead).toBe(true);
    expect(publishRefusal(out)).toBeNull();
  });
});
