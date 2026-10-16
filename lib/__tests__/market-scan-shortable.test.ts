/**
 * The sell list is cut to `perSide` only after the broker's shortable check
 * (item 6 review R5): a with-the-trend short that can't be borrowed must not
 * push a shortable setup off the list and then be dropped itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, ScanResult, Timeframe } from "@/lib/types";

const { fetchBarsBatchMock, scanTickerMock, getAssetMock } = vi.hoisted(() => ({
  fetchBarsBatchMock: vi.fn(),
  scanTickerMock: vi.fn(),
  getAssetMock: vi.fn(async (_creds: unknown, symbol: string) => ({ symbol, shortable: symbol !== "NOSH" })),
}));

vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return { ...actual, readTrend: (bars: Bar[], tf: string) => ({ ...actual.readTrend(bars, tf as never), direction: "bearish" }) };
});
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
  fetchAllTimeframesBatch: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/data/alpaca", () => ({ fetchMostActives: vi.fn(async () => []) }));
vi.mock("@/lib/scanTicker", () => ({ scanTicker: scanTickerMock }));
vi.mock("@/lib/brokers/alpaca", () => ({ envCreds: () => ({ key: "k", secret: "s", mode: "paper" }), getAsset: getAssetMock }));

import { listedSymbols, runMarketScan, takeShortable } from "@/lib/marketScan";

function daily(): Bar[] {
  return Array.from({ length: 120 }, (_, i) => {
    const c = 100 + i * 0.4;
    return { t: new Date(Date.UTC(2027, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 };
  });
}

function short(symbol: string, score: number): ScanResult {
  return {
    symbol,
    direction: "bearish",
    setupKind: "continuation",
    levels: { entry: 100, stopLoss: 103, takeProfit1: 95, masterProfit: 90 },
    decision: { score, outputState: "Execute", breakdown: [] },
    trends: [{ timeframe: "1Month", direction: "bearish" }],
  } as unknown as ScanResult;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2027, 6, 15)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchBarsBatchMock.mockImplementation(async (symbols: string[], timeframe: Timeframe) => {
    const bars = timeframe === "1Day" ? daily() : [];
    return new Map(symbols.map((s) => [s.toUpperCase(), bars]));
  });
  scanTickerMock.mockImplementation(async (symbol: string, _a: unknown, preference?: { kind: string }) =>
    preference?.kind === "continuation" ? short(symbol, symbol === "NOSH" ? 9 : symbol === "OKAY" ? 5 : 4) : { symbol, error: "not under test" },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fetchBarsBatchMock.mockReset();
  scanTickerMock.mockReset();
  getAssetMock.mockClear();
});

describe("the sell list's shortable check", () => {
  it("keeps a shortable short when a higher-scoring one can't be borrowed, and still cuts to perSide", async () => {
    const out = await runMarketScan(3, 1, undefined, ["NOSH", "OKAY", "MORE"]);
    expect(out.bearish.map((r) => r.symbol)).toEqual(["OKAY"]);
    expect(out.continuationFills.bearish).toBe(1);
  });

  it("takes the best n shortable rows in order, a chunk of n lookups at a time", async () => {
    const rows = [short("NOSH", 9), short("A", 8), short("B", 7), short("C", 6), short("D", 5)];
    expect((await takeShortable(rows, 2)).map((r) => r.symbol)).toEqual(["A", "B"]);
    getAssetMock.mockClear();
    expect((await takeShortable(rows.slice(1), 2)).map((r) => r.symbol)).toEqual(["A", "B"]);
    expect(getAssetMock).toHaveBeenCalledTimes(2);
  });
});

describe("the symbols already listed (item 6 second review F5)", () => {
  it("counts only the sell rows that can publish, so a low-ranked short doesn't block its own buy scan", () => {
    const buys = [short("B1", 5)];
    const sells = [short("S1", 9), short("S2", 8), short("S3", 2)];
    expect([...listedSymbols({ bullish: buys, bearish: sells }, 2)].sort()).toEqual(["B1", "S1", "S2"]);
  });
});

