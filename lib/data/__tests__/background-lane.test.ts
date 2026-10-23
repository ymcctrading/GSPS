import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMarketDataCache,
  BACKGROUND_BURST,
  BACKGROUND_RESERVE,
  cachedFetch,
  fetchWithRetry,
  inBackgroundLane,
  inForegroundLane,
  MarketDataError,
} from "@/lib/data/http";

// Each test uses its own provider name: the limiters are per provider and live
// for the module's lifetime.
describe("background lane", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetMarketDataCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const url = "https://x.test/v2/stocks/bars?timeframe=1Month";

  it("leaves the reserve to foreground reads", async () => {
    const rate = 10;
    const reserve = Math.floor(rate * BACKGROUND_RESERVE);
    const opts = { provider: "LaneReserve", ratePerMinute: rate, queueTimeoutMs: 40 };
    const background = await inBackgroundLane(() =>
      Promise.allSettled(Array.from({ length: rate }, () => fetchWithRetry(url, {}, opts))),
    );
    const served = background.filter((r) => r.status === "fulfilled").length;
    expect(served).toBe(rate - reserve);
    const refused = background.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(MarketDataError);
    expect((refused.reason as MarketDataError).status).toBe(429);

    // The reserve is still there for reads the response waits on.
    const foreground = await Promise.allSettled(Array.from({ length: reserve }, () => fetchWithRetry(url, {}, opts)));
    expect(foreground.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("follows the async context into nested calls", async () => {
    const opts = { provider: "LaneNested", ratePerMinute: 10, queueTimeoutMs: 40 };
    const nested = async () => {
      await Promise.resolve();
      return fetchWithRetry(url, {}, opts);
    };
    const results = await inBackgroundLane(() => Promise.allSettled(Array.from({ length: 10 }, nested)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(10 - Math.floor(10 * BACKGROUND_RESERVE));
  });

  it("a read shared by every caller leaves the lane", async () => {
    const opts = { provider: "LaneExit", ratePerMinute: 10, queueTimeoutMs: 40 };
    const results = await inBackgroundLane(() =>
      inForegroundLane(() => Promise.allSettled(Array.from({ length: 10 }, () => fetchWithRetry(url, {}, opts)))),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("holds the background lane to its burst at a scan's start", async () => {
    const opts = { provider: "LaneBurst", ratePerMinute: 150, queueTimeoutMs: 40 };
    const results = await inBackgroundLane(() =>
      Promise.allSettled(Array.from({ length: 60 }, () => fetchWithRetry(url, {}, opts))),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(BACKGROUND_BURST);
    // The main bucket keeps the rest for the scan's own reads.
    const foreground = await Promise.allSettled(Array.from({ length: 150 - BACKGROUND_BURST }, () => fetchWithRetry(url, {}, opts)));
    expect(foreground.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("a foreground caller does not join a background read in flight", async () => {
    let releaseSlow!: () => void;
    let releaseFast!: () => void;
    const slowGate = new Promise<void>((r) => (releaseSlow = r));
    const fastGate = new Promise<void>((r) => (releaseFast = r));
    const slow = vi.fn(async () => {
      await slowGate;
      return "background";
    });
    const fast = vi.fn(async () => {
      await fastGate;
      return "foreground";
    });
    const bg = inBackgroundLane(() => cachedFetch("k-lane", 0, slow));
    const fg = cachedFetch("k-lane", 0, fast);
    // Callers after it, of either lane, join the foreground read.
    const fg2 = cachedFetch("k-lane", 0, slow);
    const bg2 = inBackgroundLane(() => cachedFetch("k-lane", 0, slow));
    releaseFast();
    await expect(fg).resolves.toBe("foreground");
    await expect(fg2).resolves.toBe("foreground");
    await expect(bg2).resolves.toBe("foreground");
    releaseSlow();
    await expect(bg).resolves.toBe("background");
    expect(slow).toHaveBeenCalledTimes(1);
    expect(fast).toHaveBeenCalledTimes(1);
  });

  it("gives the lane's own token back when the main bucket times it out", async () => {
    const opts = { provider: "LaneRefund", ratePerMinute: 10, queueTimeoutMs: 40 };
    // Foreground takes the main bucket down to its reserve.
    await Promise.all(Array.from({ length: 6 }, () => fetchWithRetry(url, {}, opts)));
    const refused = await inBackgroundLane(() =>
      Promise.allSettled(Array.from({ length: 6 }, () => fetchWithRetry(url, {}, opts))),
    );
    expect(refused.every((r) => r.status === "rejected")).toBe(true);
    // Refused before sending: no request went out for them.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
