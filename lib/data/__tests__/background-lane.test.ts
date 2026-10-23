import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMarketDataCache,
  BACKGROUND_RESERVE,
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
});
