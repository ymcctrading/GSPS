import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMarketDataCache,
  cachedFetch,
  describeDataError,
  fetchWithRetry,
  MarketDataError,
} from "@/lib/data/http";

/** Minimal Response stand-in — only the fields fetchWithRetry reads. */
function res(status: number, body = "", headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetMarketDataCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Advances timers as the retry loop schedules them. */
  async function run<T>(work: Promise<T>): Promise<T> {
    const settled = work.catch((e) => ({ __err: e }) as never);
    await vi.runAllTimersAsync();
    const out = (await settled) as T & { __err?: unknown };
    if (out && typeof out === "object" && "__err" in out) throw out.__err;
    return out;
  }

  it("retries a 429 and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, '{"message": "too many requests."}'))
      .mockResolvedValueOnce(res(429, '{"message": "too many requests."}'))
      .mockResolvedValueOnce(res(200, '{"trade":{"p":115.5}}'));
    vi.stubGlobal("fetch", fetchMock);

    const out = await run(fetchWithRetry("https://x.test/q", {}, { provider: "Alpaca" }));
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry budget and reports a rate limit, not the raw body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(429, '{"message": "too many requests."}')));

    await expect(
      run(fetchWithRetry("https://x.test/q", {}, { provider: "Alpaca", retries: 2 })),
    ).rejects.toMatchObject({ name: "MarketDataError", status: 429 });
  });

  it("surfaces user-facing copy rather than the provider's wording", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(429, '{"message": "too many requests."}')));

    const err: unknown = await run(
      fetchWithRetry("https://x.test/q", {}, { provider: "Alpaca", retries: 0 }),
    ).then(
      () => null,
      (e) => e,
    );

    expect(err).toBeInstanceOf(MarketDataError);
    expect((err as MarketDataError).message).toContain("rate-limiting");
    expect((err as MarketDataError).message).not.toContain("too many requests.");
  });

  it("honours Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, "", { "retry-after": "2" }))
      .mockResolvedValueOnce(res(200, "{}"));
    vi.stubGlobal("fetch", fetchMock);

    const p = fetchWithRetry("https://x.test/q", {}, { provider: "Alpaca" });
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting out the 2s
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toMatchObject({ ok: true });
  });

  it("does not retry a client error that won't change", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404, "not found"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(fetchWithRetry("https://x.test/q", {}, { provider: "Alpaca" }))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("cachedFetch", () => {
  beforeEach(__resetMarketDataCache);

  it("serves a repeat read from cache", async () => {
    const load = vi.fn().mockResolvedValue({ price: 1 });
    await cachedFetch("k", 10_000, load);
    await cachedFetch("k", 10_000, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent readers into one upstream call", async () => {
    const load = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(() => r({ price: 1 }), 5)));
    const results = await Promise.all([
      cachedFetch("k", 0, load),
      cachedFetch("k", 0, load),
      cachedFetch("k", 0, load),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ price: 1 }, { price: 1 }, { price: 1 }]);
  });

  it("does not cache a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ price: 2 });
    await expect(cachedFetch("k", 10_000, load)).rejects.toThrow("boom");
    await expect(cachedFetch("k", 10_000, load)).resolves.toEqual({ price: 2 });
  });
});

describe("describeDataError", () => {
  it("classifies a rate limit and keeps the 429 so clients can back off", () => {
    const view = describeDataError(
      new MarketDataError("slow down", { status: 429, provider: "Alpaca", retryAfterMs: 3000 }),
    );
    expect(view).toMatchObject({ code: "rate_limited", status: 429, retryAfterMs: 3000 });
  });

  it("maps a bad key to a 502 the UI can explain", () => {
    const view = describeDataError(new MarketDataError("nope", { status: 403, provider: "Alpaca" }));
    expect(view).toMatchObject({ code: "unauthorized", status: 502 });
  });

  it("leaves a non-provider error's message intact — those are app bugs", () => {
    const view = describeDataError(new Error("Insufficient bar data for NOW"));
    expect(view).toMatchObject({ code: "unknown", message: "Insufficient bar data for NOW" });
  });
});
