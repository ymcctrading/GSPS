import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchBarsBatchMock, liveFlag } = vi.hoisted(() => ({ fetchBarsBatchMock: vi.fn(), liveFlag: { live: true } }));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ isLive: liveFlag.live, fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
}));

import {
  fromStoredReadings,
  getUniverseStrength,
  resetUniverseStrengthCache,
  setUniverseStrengthStore,
  toStoredReadings,
  type StoredReadings,
} from "@/lib/data/universeStrength";
import { buildUniverseStrength } from "@/lib/gann/universeStrength";

// No shared store unless a test hands one, so the live path is what's tested.
beforeEach(() => setUniverseStrengthStore(null));

afterEach(() => {
  resetUniverseStrengthCache();
  fetchBarsBatchMock.mockReset();
});

describe("getUniverseStrength cache", () => {
  const now = new Date("2026-10-22T19:00:00Z");

  it("reads again after a failed read instead of keeping it for the day", async () => {
    fetchBarsBatchMock.mockRejectedValueOnce(new Error("429"));
    expect(await getUniverseStrength(now)).toBeNull();
    await Promise.resolve();
    fetchBarsBatchMock.mockResolvedValueOnce(new Map());
    await getUniverseStrength(now);
    expect(fetchBarsBatchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a read that landed for the rest of the day", async () => {
    fetchBarsBatchMock.mockResolvedValue(new Map());
    await getUniverseStrength(now);
    await getUniverseStrength(now);
    expect(fetchBarsBatchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getUniverseStrength shared by month", () => {
  const now = new Date("2026-10-22T19:00:00Z");
  const monthly = (symbols: number) =>
    new Map(
      Array.from({ length: symbols }, (_, i) => [
        `S${i}`,
        Array.from({ length: 14 }, (_, m) => {
          const d = new Date(Date.UTC(2025, 8 + m, 1, 4));
          return { t: d.toISOString(), o: 10, h: 10 + i + m, l: 5, c: 8 + ((i * 7 + m) % 5), v: 1 };
        }),
      ]),
    );

  afterEach(() => {
    setUniverseStrengthStore(undefined);
    liveFlag.live = true;
  });

  it("round-trips through JSON exactly, dotted symbols and every month included", async () => {
    const bars = monthly(120);
    bars.set("BRK.B", bars.get("S3")!.map((b) => ({ ...b, c: b.c + 0.123456789 })));
    const live = buildUniverseStrength(bars);
    const back = fromStoredReadings(JSON.parse(JSON.stringify(toStoredReadings(live))));
    expect([...back.keys()].sort()).toEqual([...live.keys()].sort());
    for (const [month, entry] of live) {
      expect(back.get(month)?.sorted).toEqual(entry.sorted);
      expect(back.get(month)?.bySymbol).toEqual(entry.bySymbol);
    }
    // The month before (a scan on the 1st reads its session's month) is kept too.
    expect(back.has("2026-09")).toBe(true);
    expect(back.get("2026-10")?.bySymbol.get("BRK.B")).toBe(live.get("2026-10")?.bySymbol.get("BRK.B"));
  });

  it("does not store a read of the synthetic feed", async () => {
    liveFlag.live = false;
    fetchBarsBatchMock.mockResolvedValue(monthly(120));
    const write = vi.fn(async () => {});
    setUniverseStrengthStore({ read: async () => null, write });
    await getUniverseStrength(now);
    expect(write).not.toHaveBeenCalled();
  });

  it("reads the month's stored read without a market-data request", async () => {
    const live = buildUniverseStrength(monthly(120));
    const read = vi.fn(async () => toStoredReadings(live));
    const write = vi.fn(async () => {});
    setUniverseStrengthStore({ read, write });
    const got = await getUniverseStrength(now);
    expect(read).toHaveBeenCalledWith("2026-10");
    expect(fetchBarsBatchMock).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(got?.get("2026-10")?.sorted).toEqual(live.get("2026-10")?.sorted);
    expect(got?.get("2026-10")?.bySymbol).toEqual(live.get("2026-10")?.bySymbol);
  });

  it("reads live and stores the month when no row is there", async () => {
    fetchBarsBatchMock.mockResolvedValue(monthly(120));
    const read = vi.fn(async () => null);
    const write = vi.fn(async () => {});
    setUniverseStrengthStore({ read, write });
    const got = await getUniverseStrength(now);
    expect(fetchBarsBatchMock).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    const [month, readings, symbols] = write.mock.calls[0] as unknown as [string, StoredReadings, number];
    expect(month).toBe("2026-10");
    expect(symbols).toBe(got?.get("2026-10")?.bySymbol.size);
    expect(fromStoredReadings(readings).get("2026-10")?.sorted).toEqual(got?.get("2026-10")?.sorted);
  });

  it("does not store a read too thin to rank", async () => {
    fetchBarsBatchMock.mockResolvedValue(monthly(20));
    const write = vi.fn(async () => {});
    setUniverseStrengthStore({ read: async () => null, write });
    await getUniverseStrength(now);
    expect(write).not.toHaveBeenCalled();
  });

  it("falls back to the live read when the row can't be read", async () => {
    fetchBarsBatchMock.mockResolvedValue(monthly(120));
    const write = vi.fn(async () => {});
    setUniverseStrengthStore({
      read: async () => {
        throw new Error("down");
      },
      write,
    });
    const got = await getUniverseStrength(now);
    expect(got?.get("2026-10")?.bySymbol.size).toBeGreaterThanOrEqual(100);
  });
});
