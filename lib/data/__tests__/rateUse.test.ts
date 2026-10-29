import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetMarketDataCache, fetchWithRetry, takeRateUse } from "@/lib/data/http";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMarketDataCache();
});

function respond(status: number, headers: Record<string, string>) {
  return new Response(status === 200 ? "{}" : "too many requests.", { status, headers });
}

describe("takeRateUse", () => {
  it("keeps the busiest reading of the provider's rate headers, then clears", async () => {
    const replies = [
      respond(200, { "x-ratelimit-limit": "200", "x-ratelimit-remaining": "150" }),
      respond(200, { "x-ratelimit-limit": "200", "x-ratelimit-remaining": "120" }),
      respond(200, { "x-ratelimit-limit": "200", "x-ratelimit-remaining": "180" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift()!));
    for (let i = 0; i < 3; i++) await fetchWithRetry("https://data.example/v2/x", {}, { provider: "P", ratePerMinute: 0 });
    expect(takeRateUse("P")).toEqual({ peak: 80, limit: 200, throttled: 0 });
    expect(takeRateUse("P")).toBeNull();
  });

  it("an upstream 429 counts as the whole allowance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(429, { "x-ratelimit-limit": "200", "x-ratelimit-remaining": "0" })));
    await expect(fetchWithRetry("https://data.example/v2/x", {}, { provider: "Q", ratePerMinute: 0, retries: 0 })).rejects.toThrow();
    expect(takeRateUse("Q")).toEqual({ peak: 200, limit: 200, throttled: 1 });
  });

  it("records nothing without the headers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, {})));
    await fetchWithRetry("https://data.example/v2/x", {}, { provider: "R", ratePerMinute: 0 });
    expect(takeRateUse("R")).toBeNull();
  });
});
