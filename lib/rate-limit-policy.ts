/**
 * Which per-minute budget an /api request draws from (proxy.ts). The route
 * audit of 2026-10-21 (docs/SYNTHESIZED_ROADMAP.md Part 5 item 14) read all
 * 96 routes and sorted them by what one request costs and who would hammer it:
 *
 * | Bucket       | /min | Routes                                                                 | Why                                                                    |
 * |--------------|------|------------------------------------------------------------------------|------------------------------------------------------------------------|
 * | `credential` | 5    | connect-live, snaptrade/connect, username-login, account-status, demo/open | A password or broker-key guess, or an account probe                    |
 * | `outbound`   | 5    | notifications/send-test, push-subscription (writes), billing/checkout,  | Each sends an email or a push, or opens a Stripe session: GSPS's quota  |
 * |              |      | billing/portal, promotion upgrades (writes)                            | with an outside service, spent by one click                            |
 * | `order`      | 30   | orders, positions/*, portfolio/close, guided/execute, trade-plans,     | A write to the ledger; a person places a few a minute at most, and a   |
 * |              |      | automation/profiles (writes only; reads stay on `api`)                 | runaway client loop should stop well before the default               |
 * | `scan`       | 20   | scan, batch-scan, intraday-scan, market-scan, backtest, strategy       | Each reads bars from the market-data vendor, often many symbols        |
 * |              |      | levels, strategy-plugins/[id]/evaluate and /backtest, learning         |                                                                        |
 * |              |      | propose-weights                                                        |                                                                        |
 * | `api`        | 120  | everything else, including auth/password-breach                        | Reads of the member's own rows and single quotes. The breach check     |
 * |              |      |                                                                        | stays here: it fails open, so a refusal would let a breached password  |
 * |              |      |                                                                        | through, and people behind one office address share a budget           |
 *
 * A request carrying the scheduled jobs' `Authorization: Bearer CRON_SECRET`
 * draws from no bucket: every pg_cron call comes from Supabase's one address,
 * so an IP budget would throttle the schedule itself, and the secret's holder
 * is the platform. Admin routes keep their own bearer check and the default
 * budget. Keys stay `user ?? ip`. The four heavy buckets count in Postgres,
 * one count across every instance (`SHARED_BUCKETS`, lib/rate-limit.ts,
 * 2026-10-22); `api` counts per instance.
 *
 * Three-question basis: 1. Gann: none; access control. 2. Cycles: no
 * periodicity claim; the one-minute window is an engineering figure.
 * 3. Hermetic: Cause and Effect, a budget follows what a request causes
 * outside GSPS (a broker call, a vendor read, an email), not its URL's shape.
 * Law of Creation: a mixture; buckets partition, nothing is created.
 */

export type RateLimitBucket = "credential" | "outbound" | "order" | "scan" | "api";

export const RATE_LIMITS: Record<RateLimitBucket, number> = {
  credential: 5,
  outbound: 5,
  order: 30,
  scan: 20,
  api: 120,
};

/**
 * The buckets counted once across every server instance. `api` is left per
 * instance: it is most of the traffic, a read of the member's own rows, and a
 * shared count would add a database round trip to every page.
 */
export const SHARED_BUCKETS: ReadonlySet<RateLimitBucket> = new Set(["credential", "outbound", "order", "scan"]);

const CREDENTIAL_PREFIXES = [
  "/api/alpaca/connect-live",
  "/api/snaptrade/connect",
  "/api/auth/username-login",
  "/api/auth/account-status",
  // Signs a browser into a practice account (lib/demo/practice.ts).
  "/api/demo/open",
];

const SCAN_PREFIXES = [
  "/api/scan",
  "/api/batch-scan",
  "/api/intraday-scan",
  "/api/market-scan",
  "/api/backtest",
  "/api/strategy-levels",
  "/api/learning/propose-weights",
];
const SCAN_PATTERNS = [/^\/api\/strategy-plugins\/[^/]+\/(evaluate|backtest)$/];

const OUTBOUND_ANY_METHOD = ["/api/notifications/send-test", "/api/billing/checkout", "/api/billing/portal"];
const OUTBOUND_WRITES = ["/api/notifications/push-subscription", "/api/promotion/upgrade", "/api/promotion/paths/upgrade"];

const ORDER_WRITES = [
  "/api/orders",
  "/api/positions/",
  "/api/portfolio/close",
  "/api/guided/execute",
  "/api/trade-plans",
  "/api/automation/profiles",
];

/**
 * A prefix matches its own path and the paths under it, never a sibling that
 * only shares letters: before this audit "/api/scan" also caught
 * /api/scan-criteria and /api/scan-history, two reads of the member's rows.
 */
function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/** The bucket an /api request draws from. */
export function rateLimitBucket(path: string, method: string): RateLimitBucket {
  const write = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (startsWithAny(path, CREDENTIAL_PREFIXES)) return "credential";
  if (startsWithAny(path, OUTBOUND_ANY_METHOD) || (write && startsWithAny(path, OUTBOUND_WRITES))) return "outbound";
  if (write && startsWithAny(path, ORDER_WRITES)) return "order";
  if (SCAN_PATTERNS.some((re) => re.test(path)) || startsWithAny(path, SCAN_PREFIXES)) return "scan";
  return "api";
}
