import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * `extraSymbols` (the universe-rotation tracking + discovery symbols) has to
 * survive `resolveUniverse`'s cap regardless of how many "most active"
 * symbols the screener returns -- that guarantee is what makes the tracking
 * pass actually track. These tests exercise it directly against the real
 * `capUniverse` logic rather than re-deriving the guarantee in prose.
 */
describe("resolveUniverse extraSymbols", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/data/alpaca");
    vi.resetModules();
  });

  it("keeps extraSymbols even when the actives screener alone would fill the whole budget", async () => {
    vi.doMock("@/lib/data/alpaca", () => ({
      fetchMostActives: async (top: number) => Array.from({ length: top }, (_, i) => `ACTIVE${i}`),
      isCryptoSymbol: () => false,
    }));
    vi.resetModules();
    const { resolveUniverse } = await import("@/lib/marketScan");
    const universe = await resolveUniverse(10, ["TRACKED1", "TRACKED2"]);
    expect(universe).toContain("TRACKED1");
    expect(universe).toContain("TRACKED2");
    expect(universe.length).toBeLessThanOrEqual(10);
  });

  it("keeps extraSymbols when the actives screener fails outright", async () => {
    vi.doMock("@/lib/data/alpaca", () => ({
      fetchMostActives: async () => {
        throw new Error("screener down");
      },
      isCryptoSymbol: () => false,
    }));
    vi.resetModules();
    const { resolveUniverse } = await import("@/lib/marketScan");
    const universe = await resolveUniverse(10, ["TRACKED1"]);
    expect(universe).toContain("TRACKED1");
  });

  it("dedupes an extraSymbol that also appears in the actives screener", async () => {
    vi.doMock("@/lib/data/alpaca", () => ({
      fetchMostActives: async () => ["AAPL", "MSFT"],
      isCryptoSymbol: () => false,
    }));
    vi.resetModules();
    const { resolveUniverse } = await import("@/lib/marketScan");
    const universe = await resolveUniverse(10, ["AAPL"]);
    expect(universe.filter((s) => s === "AAPL")).toHaveLength(1);
  });

  it("defaults to no extraSymbols, unaffected for every existing caller", async () => {
    vi.doMock("@/lib/data/alpaca", () => ({
      fetchMostActives: async () => ["AAPL"],
      isCryptoSymbol: () => false,
    }));
    vi.resetModules();
    const { resolveUniverse } = await import("@/lib/marketScan");
    const universe = await resolveUniverse(10);
    expect(universe).toContain("AAPL");
  });
});
