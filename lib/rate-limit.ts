/**
 * In-memory sliding-window rate limiter for the edge proxy.
 *
 * Hobby-tier stopgap: state lives per serverless instance, so the effective
 * limit is looser under multi-instance/multi-region traffic than the numbers
 * below suggest. A shared store (Redis) is planned for Q2 alongside the rest
 * of the caching work; swap `hits` for that store then without changing the
 * call sites.
 */

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
