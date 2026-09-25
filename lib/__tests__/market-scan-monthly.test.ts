/**
 * runMarketScan's monthly fetch for the yearly-cycle re-rank runs alongside
 * the coarse daily fetch and is never waited on (AGENTS.md, "Speed is a
 * product requirement"): when it lands in time its reads reach telemetry;
 * when it hasn't, the scan finishes without it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, Timeframe } from "@/lib/types";

const { fetchBarsBatchMock } = vi.hoisted(() => ({ fetchBarsBatchMock: vi.fn() }));

vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
  fetchAllTimeframesBatch: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/data/alpaca", () => ({ fetchMostActives: vi.fn(async () => []) }));
vi.mock("@/lib/scanTicker", () => ({ scanTicker: vi.fn(async (symbol: string) => ({ symbol, error: "not under test" })) }));
vi.mock("@/lib/brokers/alpaca", () => ({ envCreds: () => null, getAsset: vi.fn() }));

import { runMarketScan } from "@/lib/marketScan";

/** Zig-zag downtrend daily series — enough bars for coarse diagnostics. */
function daily(): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 120; i++) {
    const c = 150 - i * 0.5 + 6 * Math.sin((i / 10) * 2 * Math.PI) - (i >= 110 ? (i - 109) * 1.5 : 0);
    bars.push({ t: new Date(Date.UTC(2027, 0, 1 + i)).toISOString(), o: c, h: c * 1.01, l: c * 0.99, c, v: 1_000_000 });
  }
  return bars;
}

/** Monthly V with a major low in July 2022 — a 5-year hit in July 2027. */
function monthly(): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 72; i++) {
    const c = 100 + Math.abs(i - 30) * 2;
    bars.push({ t: new Date(Date.UTC(2020, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1_000_000 });
  }
  return bars;
}

function provide(monthlyResult: () => Promise<Map<string, Bar[]>>) {
  fetchBarsBatchMock.mockImplementation(async (symbols: string[], timeframe: Timeframe) => {
    if (timeframe === "1Month") return monthlyResult();
    const bars = timeframe === "1Day" ? daily() : [];
    return new Map(symbols.map((s) => [s.toUpperCase(), bars]));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2027, 6, 15)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fetchBarsBatchMock.mockReset();
});

describe("runMarketScan monthly fetch", () => {
  it("feeds yearly-cycle reads into telemetry when it lands before the coarse pass", async () => {
    provide(async () => new Map([["AAPL", monthly()]]));
    const out = await runMarketScan(1, 15, undefined, ["AAPL"]);
    const row = out.coarseTelemetry.find((r) => r.symbol === "AAPL");
    expect(row?.year_cycle_bullish_hits).toBe(1);
    expect(row?.year_cycle_bearish_hits).toBe(0);
  });

  it("does not wait for a monthly fetch that hasn't landed", async () => {
    provide(() => new Promise(() => {})); // never resolves
    const out = await runMarketScan(1, 15, undefined, ["AAPL"]);
    const row = out.coarseTelemetry.find((r) => r.symbol === "AAPL");
    expect(row).toBeDefined();
    expect(row?.year_cycle_bullish_hits).toBeNull();
  });

  it("carries on without cycle reads when the monthly fetch fails", async () => {
    provide(async () => {
      throw new Error("upstream down");
    });
    const out = await runMarketScan(1, 15, undefined, ["AAPL"]);
    expect(out.coarseTelemetry.find((r) => r.symbol === "AAPL")?.year_cycle_bullish_hits).toBeNull();
  });
});
