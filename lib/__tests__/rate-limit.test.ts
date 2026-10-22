import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, checkSharedRateLimit, setSharedRateLimitClient } from "@/lib/rate-limit";
import { SHARED_BUCKETS } from "@/lib/rate-limit-policy";

describe("checkRateLimit", () => {
  it("allows requests up to the limit and then blocks", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks separate keys independently", () => {
    const a = `test-a:${Math.random()}`;
    const b = `test-b:${Math.random()}`;
    checkRateLimit(a, 1, 60_000);
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = `test-reset:${Math.random()}`;
    checkRateLimit(key, 1, 10);
    expect(checkRateLimit(key, 1, 10).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
  });
});

/** A client whose rpc resolves to `answer` once its abort signal is read. */
function fakeClient(answer: (args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>) {
  const rpc = vi.fn((_name: string, args: Record<string, unknown>) => ({
    abortSignal: (signal: AbortSignal) => answer(args, signal),
  }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("checkSharedRateLimit", () => {
  afterEach(() => setSharedRateLimitClient(undefined));

  it("returns the database's count, one count across instances", async () => {
    const resetAt = "2026-10-22T17:00:00.000Z";
    const { client, rpc } = fakeClient(() =>
      Promise.resolve({ data: [{ allowed: false, remaining: 0, reset_at: resetAt }], error: null }),
    );
    setSharedRateLimitClient(client);
    // The instance has seen one request; the database has seen more.
    const result = await checkSharedRateLimit(`shared:${Math.random()}`, 5, 60_000);
    expect(result).toEqual({ allowed: false, limit: 5, remaining: 0, resetAt: Date.parse(resetAt) });
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", expect.objectContaining({ p_limit: 5, p_window_ms: 60_000 }));
  });

  it("falls back to the instance's count when the database errors", async () => {
    const { client } = fakeClient(() => Promise.resolve({ data: null, error: { message: "boom" } }));
    setSharedRateLimitClient(client);
    const key = `shared-err:${Math.random()}`;
    expect((await checkSharedRateLimit(key, 1, 60_000)).allowed).toBe(true);
    expect((await checkSharedRateLimit(key, 1, 60_000)).allowed).toBe(false);
  });

  it("falls back to the instance's count when the database is slow", async () => {
    const { client } = fakeClient(
      (_args, signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    setSharedRateLimitClient(client);
    const result = await checkSharedRateLimit(`shared-slow:${Math.random()}`, 2, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("uses the instance's count when no server key is configured", async () => {
    setSharedRateLimitClient(null);
    const result = await checkSharedRateLimit(`shared-none:${Math.random()}`, 3, 60_000);
    expect(result).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("shares the four heavy buckets and leaves the api bucket per instance", () => {
    expect([...SHARED_BUCKETS].sort()).toEqual(["credential", "order", "outbound", "scan"]);
  });
});
