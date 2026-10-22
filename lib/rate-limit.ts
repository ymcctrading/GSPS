/**
 * Rate limiter for the proxy (proxy.ts).
 *
 * `checkRateLimit` counts per serverless instance, so a caller spread over
 * several instances gets several budgets; it serves the `api` bucket, reads
 * of a member's own rows, where that looseness costs nothing.
 * `checkSharedRateLimit` counts in Postgres (migration 0114,
 * `rate_limit_hit`), one count across every instance, for the heavy buckets
 * (lib/rate-limit-policy.ts#SHARED_BUCKETS; owner's pick 2026-10-22). If the
 * database can't answer within `SHARED_TIMEOUT_MS`, the in-instance count
 * decides, so a slow database never blocks a request and never lifts the
 * limit altogether.
 *
 * Three-question basis: 1. Gann: none; access control. 2. Cycles: the
 * one-minute window is a returning cycle, an engineering figure. 3. Hermetic:
 * Correspondence, the same count wherever the request lands. Law of
 * Creation: a mixture; the two stores split the buckets, nothing is created.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey } from "@/lib/supabase/service-key";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory: drop expired buckets on a cadence instead of on every call.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

/**
 * Fixed-window counter keyed by caller-supplied string (user id or IP,
 * usually combined with a route class so different endpoints get separate
 * budgets).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, limit, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

/** How long the proxy waits on the shared count before the instance's count decides. Engineering choice. */
export const SHARED_TIMEOUT_MS = 300;

let sharedClient: SupabaseClient | null | undefined;

function shared(): SupabaseClient | null {
  if (sharedClient !== undefined) return sharedClient;
  // The same URL fallback as proxy.ts and lib/supabase/server.ts.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
  const key = serviceRoleKey();
  sharedClient = key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
  if (!sharedClient) console.warn("[rate-limit] no server key: heavy buckets count per instance");
  return sharedClient;
}

/** Test seam: replace (or clear, with `undefined`) the client the shared count uses. */
export function setSharedRateLimitClient(client: SupabaseClient | null | undefined) {
  sharedClient = client;
}

/**
 * The same fixed-window count as `checkRateLimit`, held in Postgres so every
 * instance reads one count. The instance's own count is kept as well, and
 * decides whenever the database read fails or is slow.
 */
export async function checkSharedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const local = checkRateLimit(key, limit, windowMs);
  const client = shared();
  if (!client) return local;
  const startedAt = Date.now();
  try {
    const { data, error } = await client
      .rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_ms: windowMs })
      .abortSignal(AbortSignal.timeout(SHARED_TIMEOUT_MS));
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; remaining: number; reset_at: string }
      | null;
    if (error || !row) throw new Error(error?.message ?? "no row");
    return { allowed: row.allowed, limit, remaining: row.remaining, resetAt: Date.parse(row.reset_at) };
  } catch (e) {
    console.warn(
      `[rate-limit] shared count unavailable after ${Date.now() - startedAt}ms, instance count used: ${e instanceof Error ? e.message : String(e)}`,
    );
    return local;
  }
}
