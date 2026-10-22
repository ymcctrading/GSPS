import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchBarsBatchMock } = vi.hoisted(() => ({ fetchBarsBatchMock: vi.fn() }));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ isLive: true, fetchBars: vi.fn(), fetchBarsBatch: fetchBarsBatchMock }),
}));

import { getUniverseStrength, resetUniverseStrengthCache } from "@/lib/data/universeStrength";

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
