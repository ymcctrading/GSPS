import { describe, expect, it, vi } from "vitest";
import { coarseReversion, MIN_SCAN_PRICE, filterShortable } from "@/lib/marketScan";
import type { Bar, ScanResult } from "@/lib/types";

/**
 * A synthetic 80-day series that reads as an extended downtrend against a
 * bullish reversion candidate — every criterion coarseReversion scores is a
 * ratio of price (SMA distance, pivot direction, level proximity as a % of
 * price), so scaling every bar by the same factor reproduces the identical
 * read at a different absolute price. That isolates the $5 price floor as
 * the only thing that can tell the two apart.
 */
function extendedDowntrend(scale: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 80; i++) {
    // Gentle decline for the first 70 bars, then a sharp final leg down so
    // price sits well below its 50-bar mean — the "primed for reversion"
    // extension coarseReversion looks for.
    const base = i < 70 ? 100 - i * 0.3 : 100 - 70 * 0.3 - (i - 70) * 3;
    const c = base * scale;
    bars.push({ t: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, o: c, h: c * 1.01, l: c * 0.99, c, v: 1_000_000 });
  }
  return bars;
}

describe("coarseReversion price floor", () => {
  it("rejects a candidate priced below the penny-stock floor", () => {
    const pennyBars = extendedDowntrend(0.05); // final close well under $5
    expect(pennyBars[pennyBars.length - 1].c).toBeLessThan(MIN_SCAN_PRICE);
    expect(coarseReversion("PENNY", pennyBars)).toBeNull();
  });

  it("reads the identical shape the same way at any price above the floor", () => {
    // Every criterion coarseReversion scores is a ratio (SMA distance, pivot
    // direction, level proximity as a % of price), so the same shape scaled
    // to two different prices — both comfortably above the floor — has to
    // produce the same read. Only crossing the floor itself should change
    // the outcome.
    const at1000 = coarseReversion("A", extendedDowntrend(10));
    const at2000 = coarseReversion("B", extendedDowntrend(20));
    expect(at1000?.coarseScore).toEqual(at2000?.coarseScore);
    expect(at1000?.direction).toEqual(at2000?.direction);
  });
});

function scanResult(symbol: string): ScanResult {
  return {
    symbol,
    direction: "bearish",
    error: null,
  } as unknown as ScanResult;
}

describe("filterShortable", () => {
  it("drops bearish results the broker reports as not shortable", async () => {
    vi.doMock("@/lib/brokers/alpaca", () => ({
      envCreds: () => ({ key: "k", secret: "s", mode: "paper" }),
      getAsset: async (_creds: unknown, symbol: string) => ({
        symbol,
        tradable: true,
        shortable: symbol !== "ONDS",
        easy_to_borrow: symbol !== "ONDS",
      }),
    }));
    vi.resetModules();
    const { filterShortable: filterShortableMocked } = await import("@/lib/marketScan");
    const results = [scanResult("ONDS"), scanResult("AAPL")];
    const filtered = await filterShortableMocked(results);
    expect(filtered.map((r) => r.symbol)).toEqual(["AAPL"]);
    vi.doUnmock("@/lib/brokers/alpaca");
    vi.resetModules();
  });

  it("fails open when the broker isn't configured, so scan results aren't dropped over a missing key", async () => {
    const results = [scanResult("ONDS")];
    const filtered = await filterShortable(results);
    expect(filtered).toEqual(results);
  });
});
