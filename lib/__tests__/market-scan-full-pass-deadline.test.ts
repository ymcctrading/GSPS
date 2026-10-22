/**
 * The full pass stops waiting for its shortlist's bars at
 * `FULL_PASS_FETCH_DEADLINE_MS` (40 s from the start of the scan) and scores
 * nothing, rather than holding the run into the route's 60 s limit (27
 * scheduled scan calls timed out that way on 2026-10-22).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, Timeframe } from "@/lib/types";

const { fetchBarsBatchMock, fetchAllMock, scanTickerMock } = vi.hoisted(() => ({
  fetchBarsBatchMock: vi.fn(),
  fetchAllMock: vi.fn(),
  scanTickerMock: vi.fn(async (symbol: string) => ({ symbol, error: "not under test" })),
}));

vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
  fetchAllTimeframesBatch: fetchAllMock,
}));
vi.mock("@/lib/data/alpaca", () => ({ fetchMostActives: vi.fn(async () => []) }));
vi.mock("@/lib/scanTicker", () => ({ scanTicker: scanTickerMock }));
vi.mock("@/lib/brokers/alpaca", () => ({ envCreds: () => null, getAsset: vi.fn() }));

import { runMarketScan } from "@/lib/marketScan";

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
  scanTickerMock.mockClear();
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
});
