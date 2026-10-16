/**
 * runMarketScan reads each symbol's main trend from its monthly chart when the
 * monthly fetch has landed (item 6 review R1, A-TREND-01: the monthly gives the
 * main trend, W006 p.19), so the continuation pass asks the full scan for the
 * side Gann's weighted trend runs. The trend reads are pinned per timeframe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, Timeframe } from "@/lib/types";

const { fetchBarsBatchMock, scanTickerMock } = vi.hoisted(() => ({
  fetchBarsBatchMock: vi.fn(),
  scanTickerMock: vi.fn(async (symbol: string) => ({ symbol, error: "not under test" })),
}));

const dirs: Record<string, "bullish" | "bearish" | "sideways"> = {};
vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return {
    ...actual,
    readTrend: (bars: Bar[], tf: string) => {
      const r = actual.readTrend(bars, tf as never);
      return dirs[tf] ? { ...r, direction: dirs[tf] } : r;
    },
  };
});
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
  fetchAllTimeframesBatch: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/data/alpaca", () => ({ fetchMostActives: vi.fn(async () => []) }));
vi.mock("@/lib/scanTicker", () => ({ scanTicker: scanTickerMock }));
vi.mock("@/lib/brokers/alpaca", () => ({ envCreds: () => null, getAsset: vi.fn() }));

import { runMarketScan } from "@/lib/marketScan";

function daily(): Bar[] {
  return Array.from({ length: 120 }, (_, i) => {
    const c = 100 + i * 0.4;
    return { t: new Date(Date.UTC(2027, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 };
  });
}

function monthly(): Bar[] {
  return Array.from({ length: 72 }, (_, i) => {
    const c = 100 + i;
    return { t: new Date(Date.UTC(2021, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });
}

beforeEach(() => {
  for (const k of Object.keys(dirs)) delete dirs[k];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2027, 6, 15)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchBarsBatchMock.mockImplementation(async (symbols: string[], timeframe: Timeframe) => {
    const bars = timeframe === "1Month" ? monthly() : timeframe === "1Day" ? daily() : [];
    return new Map(symbols.map((s) => [s.toUpperCase(), bars]));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fetchBarsBatchMock.mockReset();
  scanTickerMock.mockClear();
});

function continuationSides(): string[] {
  return scanTickerMock.mock.calls
    .map((c) => (c as unknown[])[2] as { direction: string; kind: string } | undefined)
    .filter((p) => p?.kind === "continuation")
    .map((p) => p!.direction);
}

describe("runMarketScan's main trend", () => {
  it("scans a continuation on the monthly chart's side when the weekly and daily run against it", async () => {
    Object.assign(dirs, { "1Month": "bullish", "1Week": "bearish", "1Day": "bearish" });
    await runMarketScan(1, 15, undefined, ["AAPL"]);
    expect(continuationSides()).toEqual(["bullish"]);
  });

  it("logs the monthly-led trend in telemetry", async () => {
    Object.assign(dirs, { "1Month": "bearish", "1Week": "bullish", "1Day": "bullish" });
    const out = await runMarketScan(1, 15, undefined, ["AAPL"]);
    expect(out.coarseTelemetry.find((r) => r.symbol === "AAPL")?.direction).toBe("bearish");
  });
});

describe("the continuation pass's budget (item 6 review R4)", () => {
  it("scans at most 12 with-the-trend candidates a run, whatever the pool holds", async () => {
    Object.assign(dirs, { "1Month": "bullish", "1Week": "bullish", "1Day": "bullish" });
    const symbols = Array.from({ length: 20 }, (_, i) => `S${i}`);
    await runMarketScan(20, 15, undefined, symbols);
    expect(continuationSides()).toHaveLength(12);
  });
});
