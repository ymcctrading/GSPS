/**
 * Shared HTTP plumbing for the market-data providers.
 *
 * Alpaca's free tier caps requests per minute, and the app is chatty by design:
 * the ticker page runs a scan, polls a quote, refreshes a Level II book, and
 * loads an options chain — several of which ask the upstream API for the same
 * snapshot within the same second. Left alone that trips a 429 and the raw
 * Alpaca text ("too many requests.") lands in the UI.
 *
 * Three mechanisms keep that from happening, in order of cheapness:
 *   1. a short TTL cache, so a repeated read inside the window costs nothing;
 *   2. in-flight coalescing, so N concurrent callers share one upstream request;
 *   3. retry with exponential backoff + jitter, honouring `Retry-After`.
 *
 * Anything that still fails throws `MarketDataError`, which carries the HTTP
 * status so routes can answer with the right code and copy instead of leaking
 * the provider's wording.
 */

/** A provider request that failed, with enough context to explain it to a user. */
export class MarketDataError extends Error {
  readonly status: number;
  readonly provider: string;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    opts: { status: number; provider: string; retryAfterMs?: number | null },
  ) {
    super(message);
    this.name = "MarketDataError";
    this.status = opts.status;
    this.provider = opts.provider;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }
}

/** True when the failure is worth another attempt (throttling or a transient 5xx). */
function retriable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * `Retry-After` is either a delay in seconds or an HTTP date. Both spellings
 * appear in the wild; returns null when the header is absent or unparseable.
 */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Token-bucket limiter, one per provider, shared by every call site that
 * routes through `fetchWithRetry`. A single market scan or ticker scan fires
 * dozens of concurrent requests (see `runMarketScan` / `scanTicker`) — without
 * this, that burst trips the upstream per-minute cap immediately and every
 * request then fights the same 429 with its own retry/backoff, which is what
 * kept re-triggering the rate-limit banner instead of resolving it. Queuing
 * here keeps outbound traffic under the cap in the first place.
 */
class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  private readonly refillPerMs: number;

  constructor(private readonly capacity: number) {
    this.tokens = capacity;
    this.refillPerMs = capacity / 60_000;
  }

  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.refillPerMs);
    this.lastRefill = now;
  }

  /**
   * Waits for a token, up to `deadline` (`Date.now()`-based). Unbounded
   * waiting here was a real production bug: the 2026-09-22 change to run the
   * market scan every 15 minutes during market hours (see
   * `.github/workflows/full-market-scan.yml`) means this shared bucket can
   * now be under near-continuous load all day, regardless of how many
   * symbols any one run covers. A concurrent single-ticker chart load
   * queuing here with no ceiling could wait past Vercel's 60s function
   * `maxDuration` and get hard-killed with no HTTP response at all — which a
   * browser reports as a bare connection failure ("This page couldn't
   * load"), not as this app's own graceful rate-limit message. Bounding the
   * wait converts that silent hang into the same clean, fast
   * `MarketDataError` a live 429 would produce.
   */
  async acquire(deadline: number): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      if (Date.now() >= deadline) throw new QueueTimeoutError();
      // Capped so a near-empty bucket (a slow refill relative to `deadline`)
      // rechecks the deadline periodically instead of oversleeping well past it.
      const wait = Math.max((1 - this.tokens) / this.refillPerMs, 10);
      await sleep(Math.min(wait, 250));
    }
  }
}

/** Internal signal that a caller gave up waiting for a rate-limit token. */
class QueueTimeoutError extends Error {}

const limiters = new Map<string, RateLimiter>();
function limiterFor(provider: string, ratePerMinute: number): RateLimiter {
  let limiter = limiters.get(provider);
  if (!limiter) {
    limiter = new RateLimiter(ratePerMinute);
    limiters.set(provider, limiter);
  }
  return limiter;
}

export interface RetryOptions {
  /** Label used in error messages, e.g. "Alpaca". */
  provider: string;
  /** Extra attempts after the first. */
  retries?: number;
  /** First backoff step; doubles each attempt. */
  baseDelayMs?: number;
  /** Ceiling for a single backoff step. */
  maxDelayMs?: number;
  /**
   * Outbound cap for this provider, shared across all callers. Left below
   * Alpaca's documented ~200/min so retries and other providers' headroom
   * don't push the account over it. Set to 0 to disable throttling.
   */
  ratePerMinute?: number;
  /**
   * Ceiling on total time spent queued for a rate-limit token, across every
   * attempt combined. Well under Vercel's 60s Hobby `maxDuration` so a caller
   * always gets a real response — success or a clean error — instead of
   * being hard-killed mid-queue. See `RateLimiter.acquire`'s doc comment.
   */
  queueTimeoutMs?: number;
}

/**
 * Fetch with retry/backoff on throttling and transient server errors.
 * Non-retriable failures throw immediately — a 404 is not worth four tries.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit,
  opts: RetryOptions,
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 4000;
  const ratePerMinute = opts.ratePerMinute ?? 150;
  const queueDeadline = Date.now() + (opts.queueTimeoutMs ?? 12_000);

  let lastStatus = 0;
  let lastBody = "";
  let lastRetryAfter: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (ratePerMinute > 0) {
      try {
        await limiterFor(opts.provider, ratePerMinute).acquire(queueDeadline);
      } catch {
        // Gave up waiting for a token — report it exactly like a live 429
        // rather than hanging until the platform kills the function.
        throw new MarketDataError(describe(opts.provider, 429, ""), {
          status: 429,
          provider: opts.provider,
          retryAfterMs: null,
        });
      }
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // A network-level failure is retriable on the same schedule as a 503.
      if (attempt === retries) {
        throw new MarketDataError(
          `${opts.provider} is unreachable right now. ${err instanceof Error ? err.message : String(err)}`,
          { status: 503, provider: opts.provider },
        );
      }
      await sleep(backoff(attempt, baseDelay, maxDelay, null));
      continue;
    }

    if (res.ok) return res;

    lastStatus = res.status;
    lastBody = (await res.text()).slice(0, 200);
    lastRetryAfter = retryAfterMs(res);

    if (!retriable(res.status) || attempt === retries) break;
    await sleep(backoff(attempt, baseDelay, maxDelay, lastRetryAfter));
  }

  throw new MarketDataError(describe(opts.provider, lastStatus, lastBody), {
    status: lastStatus,
    provider: opts.provider,
    retryAfterMs: lastRetryAfter,
  });
}

/**
 * Exponential backoff with full jitter. Jitter matters here because the ticker
 * page fires several requests at once — without it they would all retry in
 * lockstep and re-trip the same limit.
 */
function backoff(attempt: number, base: number, max: number, retryAfter: number | null): number {
  if (retryAfter != null) return Math.min(retryAfter, max);
  const ceiling = Math.min(base * 2 ** attempt, max);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** User-facing wording for a provider failure — never the raw upstream body. */
function describe(provider: string, status: number, body: string): string {
  if (status === 429) {
    return `${provider} is rate-limiting requests right now (free data tier). Prices will refresh automatically in a moment.`;
  }
  if (status === 401 || status === 403) {
    return `${provider} rejected the API credentials. Check the keys in Settings.`;
  }
  if (status === 404) return `${provider} has no data for this symbol.`;
  if (status >= 500) return `${provider} is having trouble serving data right now. Retrying shortly.`;
  return `${provider} request failed (${status})${body ? `: ${body}` : ""}`;
}

export interface DataErrorView {
  /** Copy safe to render directly in the UI. */
  message: string;
  /** Stable discriminator the UI can branch on (e.g. to offer a retry). */
  code: "rate_limited" | "unauthorized" | "not_found" | "upstream" | "unknown";
  /** HTTP status an API route should answer with. */
  status: number;
  /** Suggested wait before retrying, when the provider told us one. */
  retryAfterMs: number | null;
}

/**
 * Normalize any thrown value into something an API route or component can show.
 * Errors that didn't come from a provider keep their own message — those are
 * app bugs, and hiding them behind generic copy makes them harder to find.
 */
export function describeDataError(err: unknown): DataErrorView {
  if (err instanceof MarketDataError) {
    const code =
      err.status === 429
        ? "rate_limited"
        : err.status === 401 || err.status === 403
          ? "unauthorized"
          : err.status === 404
            ? "not_found"
            : "upstream";
    return {
      message: err.message,
      code,
      // 429 propagates as-is so the client can back off; everything else is a
      // bad gateway from the app's point of view.
      status: err.status === 429 ? 429 : err.status === 404 ? 404 : 502,
      retryAfterMs: err.retryAfterMs,
    };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    code: "unknown",
    status: 502,
    retryAfterMs: null,
  };
}

/* ------------------------------------------------------------------ caching */

interface CacheEntry {
  at: number;
  ttlMs: number;
  // The parsed provider payload — shape varies per endpoint, narrowed by callers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

const cache = new Map<string, CacheEntry>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlight = new Map<string, Promise<any>>();

/** Drop expired entries so a long-lived server instance doesn't grow unbounded. */
function sweep(now: number) {
  if (cache.size < 256) return;
  for (const [key, entry] of cache) {
    if (now - entry.at > entry.ttlMs) cache.delete(key);
  }
}

/**
 * Run `load` at most once per `ttlMs` per key, and only once at a time.
 * Concurrent callers with the same key await the same promise, so a page that
 * mounts three components asking for one snapshot makes one upstream request.
 *
 * A `ttlMs` of 0 disables caching but still coalesces in-flight duplicates.
 */
export async function cachedFetch<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && ttlMs > 0 && now - hit.at < hit.ttlMs) return hit.value as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      if (ttlMs > 0) {
        cache.set(key, { at: Date.now(), ttlMs, value });
        sweep(Date.now());
      }
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Test seam — clears the module-level cache between cases. */
export function __resetMarketDataCache() {
  cache.clear();
  inFlight.clear();
}
