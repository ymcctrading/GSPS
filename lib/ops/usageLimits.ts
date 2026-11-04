/**
 * GSPS — the free-tier usage meters, their alert thresholds and the 99% hold
 * (owner, 2026-10-28: "Now that we're private. Be sure to track how close we
 * are to reaching our limit(s). Update us at 25, 50, 60, 65, 70, and in
 * intervals of 5 until 90% of usage. Go by 2 until 96%. Then go by 1 until 99.
 * But never allow us to use all 100% of our limits unless it is within the
 * last two days of the allotted month.").
 *
 * Pure: the meters, their periods, which thresholds a reading has crossed,
 * whether a reading holds further use, and the alert's words. The store and
 * the route (`lib/ops/usageStore.ts`, `/api/ops/usage`) read and write the rows.
 *
 * The meters, each with the free plan's figure:
 * - GitHub Actions minutes, 2,000 a calendar month (the free plan for a
 *   private repository; billed per job, rounded up to the minute). Metered by
 *   each job reporting its own minutes at its end (`.github/workflows/*`).
 * - Vercel deployments, 100 in a rolling 24 hours (Hobby). Only `main` builds,
 *   so each push to `main` is one deployment.
 * - Email, Resend's free 100 a day and 3,000 a month, read from our own send
 *   ledger (`email_daily_budget`).
 * - The Supabase database, 500 MB (free project). Not a periodic limit.
 * - Supabase connections (the database's max_connections, 60), file storage
 *   (1 GB) and monthly active users (50,000; a lower bound, since a user is
 *   counted by their last sign-in only). Alert only, once a month per
 *   threshold.
 * - Alpaca's data API, 200 requests a minute (free plan), read as the month's
 *   busiest minute from the account-wide headers the responses carry. Alert
 *   only: the app's own limiter keeps under it, so a reading near 100% means
 *   that limiter is too loose or a second caller shares the key.
 *
 * GitHub bills no Actions minutes on a public repository's standard runners
 * (owner, 2026-10-30: the repository is public again until the edge is
 * verified, then private). So the Actions meter follows the repository's
 * visibility, read from GitHub at each reading: while public it alerts and
 * holds nothing, and a job's minutes are recorded as unbilled; once private
 * again the 2,000 minutes are metered as before. A visibility that can't be
 * read is treated as private, so the meter never goes quiet by mistake.
 *
 * - Vercel's function limits (2026-11-04, after Vercel blocked the account on
 *   Nov 3 for a Hobby limit run out): 4 hours of active CPU and 1 million
 *   invocations a month. Hobby has no usage API, so the app measures its own
 *   scheduled calls (`lib/ops/functionMeter.ts`): every call the scheduled
 *   jobs' secret opens records its CPU time and wall time. That is the
 *   scheduled share only; members' page views are not seen, so a reading is
 *   reconciled from the Usage page when a session reads it. Both hold at 99%:
 *   pg_cron's `gsps_ops.call_endpoint` stops calling (migration 0142), the one
 *   way to keep the account from being blocked again. Neither has the last-two-
 *   days exemption: Vercel's billing month is the account's own cycle, not
 *   the calendar month, so a calendar exemption could let the limit run out.
 *
 * Not readable from here, so not metered (docs/THIRD_PARTY_LIMITS.md): Supabase
 * egress (5 GB a month) and Vercel's 100 GB of transfer a month (dominated by
 * page views, which the app can't count without a write per view).
 *
 * The owner's month, read for each limit (his "the allotted month"):
 * - A monthly limit's month is its own billing month (UTC, as GitHub and
 *   Resend count), and its last two days are exempt from the hold.
 * - A daily limit (email's 100 a day) has a day for its period. Its "last two
 *   days" would be the whole period, so it is never exempt.
 * - A rolling window (Vercel's 24 hours) has no end to be near, so it is
 *   never exempt.
 * - The database's size has no period at all. It alerts once a month per
 *   threshold and holds nothing: there is no consumption to refuse that would
 *   not break the product.
 *
 * Thresholds: 25, 50, 60, 65, 70, 75, 80, 85, 90, 92, 94, 96, 97, 98, 99, each
 * sent once a period. A reading that crosses several at once sends one alert
 * naming the highest. At 99% the hold starts: further use is refused unless
 * the owner has approved an urgent production fix (an override) or the limit
 * is in its exempt last two days.
 *
 * Three-question basis: 1. Gann: none, operations. 2. Cycles: each limit's period is its provider's;
 * no periodicity claim. 3. Hermetic: Rhythm, every period returns, so a
 * threshold re-arms when its period does. Law of Creation: usage ⊗ limit is
 * a mixture until the reading is acted on; the hold is the created third.
 */

export type UsageMeterId =
  | "github_actions"
  | "vercel_deployments"
  | "email_daily"
  | "email_monthly"
  | "supabase_db"
  | "supabase_connections"
  | "supabase_storage"
  | "supabase_mau"
  | "alpaca_rate"
  | "vercel_cpu"
  | "vercel_invocations";

export type PeriodKind = "month" | "day" | "rolling24h" | "none";

export interface UsageMeter {
  id: UsageMeterId;
  label: string;
  unit: string;
  limit: number;
  period: PeriodKind;
  /** Whether reaching 99% refuses further use. */
  holds: boolean;
  /** True when a monthly limit's last two days do not lift the hold (its provider's month isn't the calendar month). */
  noExemption?: boolean;
}

export const USAGE_METERS: Record<UsageMeterId, UsageMeter> = {
  github_actions: { id: "github_actions", label: "GitHub Actions minutes", unit: "minutes", limit: 2000, period: "month", holds: true },
  vercel_deployments: { id: "vercel_deployments", label: "Vercel deployments", unit: "deployments", limit: 100, period: "rolling24h", holds: true },
  email_daily: { id: "email_daily", label: "Emails today", unit: "emails", limit: 100, period: "day", holds: true },
  email_monthly: { id: "email_monthly", label: "Emails this month", unit: "emails", limit: 3000, period: "month", holds: true },
  supabase_db: { id: "supabase_db", label: "Supabase database size", unit: "MB", limit: 500, period: "none", holds: false },
  // Read hourly. 60 is the database's own max_connections on the free
  // compute (read 2026-10-28). Keyed by the month, not the day: the pool
  // already sits near 25%, and a daily key would mail the same thresholds
  // every day and spend the ops email budget on routine readings.
  supabase_connections: { id: "supabase_connections", label: "Supabase database connections", unit: "connections", limit: 60, period: "month", holds: false },
  supabase_storage: { id: "supabase_storage", label: "Supabase file storage", unit: "MB", limit: 1000, period: "none", holds: false },
  supabase_mau: { id: "supabase_mau", label: "Supabase monthly active users", unit: "users", limit: 50_000, period: "month", holds: false },
  // The busiest minute of the month, from Alpaca's own rate-limit headers.
  // Alert only: our token bucket (lib/data/http.ts) already queues under it,
  // at about 75% of 200, so a daily key would mail 25/50/75 every day.
  alpaca_rate: { id: "alpaca_rate", label: "Alpaca data requests in a minute", unit: "requests a minute", limit: 200, period: "month", holds: false },
  // Hobby: 4 hours of active CPU a month. Measured on scheduled calls only.
  vercel_cpu: { id: "vercel_cpu", label: "Vercel function CPU (scheduled jobs)", unit: "CPU minutes", limit: 240, period: "month", holds: true, noExemption: true },
  // Hobby: 1 million function invocations a month. Scheduled calls only.
  vercel_invocations: { id: "vercel_invocations", label: "Vercel function calls (scheduled jobs)", unit: "calls", limit: 1_000_000, period: "month", holds: true, noExemption: true },
};

/** The owner's thresholds, in percent. */
export const USAGE_THRESHOLDS: readonly number[] = Object.freeze([25, 50, 60, 65, 70, 75, 80, 85, 90, 92, 94, 96, 97, 98, 99]);

/** The share at which further use is refused. */
export const HOLD_PERCENT = 99;

/** The last days of a monthly period in which the hold lifts. */
export const EXEMPT_LAST_DAYS = 2;

const DAY_MS = 86_400_000;

export interface Period {
  /** Inclusive start of the period, for summing events. */
  start: Date;
  /** Exclusive end, or null for a rolling window or no period. */
  end: Date | null;
  /** Names the period for alert dedupe: one alert per threshold per key. */
  key: string;
}

/** The period a meter's reading at `now` belongs to. */
export function periodOf(meter: UsageMeter, now: Date): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const iso = now.toISOString();
  switch (meter.period) {
    case "month":
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)), key: iso.slice(0, 7) };
    case "day":
      return { start: new Date(Date.UTC(y, m, d)), end: new Date(Date.UTC(y, m, d + 1)), key: iso.slice(0, 10) };
    case "rolling24h":
      // Dedupe re-arms after a day: the key is the UTC day the alert is sent,
      // and `alertsDue` also skips a threshold sent within the last 24 hours.
      return { start: new Date(now.getTime() - DAY_MS), end: null, key: iso.slice(0, 10) };
    case "none":
      return { start: new Date(0), end: null, key: iso.slice(0, 7) };
  }
}

/** True inside a monthly period's last two days, when the hold lifts. */
export function inExemptWindow(meter: UsageMeter, now: Date): boolean {
  if (meter.period !== "month" || meter.noExemption) return false;
  const { end } = periodOf(meter, now);
  return end !== null && end.getTime() - now.getTime() <= EXEMPT_LAST_DAYS * DAY_MS;
}

export function percentUsed(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, (used / limit) * 100);
}

/**
 * Where a monthly reading is headed: what has been used so far, carried at
 * the same pace to the period's end. Null for any other period, and in the
 * period's first hour, when the pace is not yet a pace.
 */
export function projectedAtPeriodEnd(meter: UsageMeter, used: number, now: Date): number | null {
  if (meter.period !== "month" || !Number.isFinite(used) || used < 0) return null;
  const { start, end } = periodOf(meter, now);
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 3_600_000) return null;
  return (used * (end!.getTime() - start.getTime())) / elapsed;
}

/** The thresholds at or below the reading, lowest first. */
export function crossedThresholds(pct: number): number[] {
  return USAGE_THRESHOLDS.filter((t) => pct >= t);
}

/**
 * The thresholds still to send for this reading: crossed, and not already
 * sent in this period (or, for a rolling window, in the last 24 hours).
 */
export function alertsDue(pct: number, sent: readonly { threshold: number; sentAt: Date }[], meter: UsageMeter, now: Date): number[] {
  const crossed = crossedThresholds(pct);
  const recent = (t: number) =>
    sent.some((s) => s.threshold === t && (meter.period !== "rolling24h" || now.getTime() - s.sentAt.getTime() < DAY_MS));
  return crossed.filter((t) => !recent(t));
}

export type RepoVisibility = "public" | "private" | "unknown";

/**
 * The repository's visibility from GitHub's answer to `GET /repos/{owner}/{repo}`.
 * A 404 to an unauthenticated read is a private repository; any other failure
 * is unknown, which the meter treats as private.
 */
export function visibilityFromGithub(status: number, body: unknown): RepoVisibility {
  if (status === 404) return "private";
  if (status !== 200 || !body || typeof body !== "object") return "unknown";
  const b = body as { visibility?: unknown; private?: unknown };
  if (b.visibility === "public" || b.private === false) return "public";
  if (b.visibility === "private" || b.visibility === "internal" || b.private === true) return "private";
  return "unknown";
}

/** Whether a meter counts against a limit: Actions minutes only while the repository is not public. */
export function meterBilled(meter: UsageMeterId, visibility: RepoVisibility): boolean {
  return meter !== "github_actions" || visibility !== "public";
}

export const PUBLIC_REPO_REASON = "The repository is public: GitHub Actions minutes are free and not metered.";

export interface HoldDecision {
  hold: boolean;
  reason: string;
}

/** Whether a reading refuses further use of the limit. */
export function holdDecision(meter: UsageMeter, used: number, now: Date, override: { until: Date; reason: string } | null): HoldDecision {
  const pct = percentUsed(used, meter.limit);
  if (!meter.holds || pct < HOLD_PERCENT) return { hold: false, reason: `${meter.label} at ${pct.toFixed(1)}%.` };
  if (inExemptWindow(meter, now)) {
    return { hold: false, reason: `${meter.label} at ${pct.toFixed(1)}%, inside the month's last ${EXEMPT_LAST_DAYS} days: the rest may be used.` };
  }
  if (override && override.until.getTime() > now.getTime()) {
    return { hold: false, reason: `${meter.label} at ${pct.toFixed(1)}%; urgent fix approved by the owner until ${formatEt(override.until)} (${override.reason}).` };
  }
  return {
    hold: true,
    reason: `${meter.label} at ${pct.toFixed(1)}% (${round(used)} of ${meter.limit} ${meter.unit}): held at ${HOLD_PERCENT}% until ${resetText(meter, now)}. An urgent production fix the owner approves can be let through.`,
  };
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A time in New York, as the owner reads times ("6:20 PM ET, Oct 28"). */
export function formatEt(date: Date): string {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  // "Oct 28, 6:20 PM" → "6:20 PM ET, Oct 28"
  const [day, time] = text.split(", ");
  return time ? `${time} ET, ${day}` : `${text} ET`;
}

/** When the meter's room comes back, in words. */
export function resetText(meter: UsageMeter, now: Date): string {
  const period = periodOf(meter, now);
  switch (meter.period) {
    case "month":
      if (meter.noExemption) return "the provider's billing month resets (its Usage page shows the date), or the owner approves an urgent fix";
      return `the month's last ${EXEMPT_LAST_DAYS} days begin at ${formatEt(new Date(period.end!.getTime() - EXEMPT_LAST_DAYS * DAY_MS))} (the count resets ${formatEt(period.end!)})`;
    case "day":
      return `the count resets at ${formatEt(period.end!)}`;
    case "rolling24h":
      return "older uses leave the 24-hour window";
    case "none":
      return "space is freed";
  }
}

export interface UsageReading {
  meter: UsageMeter;
  used: number;
  now: Date;
}

/** The alert's subject and text, for the owner. */
export function renderAlert(reading: UsageReading, threshold: number, hold: HoldDecision): { subject: string; text: string } {
  const { meter, used, now } = reading;
  const pct = percentUsed(used, meter.limit);
  const lines = [
    `${meter.label} passed ${threshold}% at ${formatEt(now)}.`,
    "",
    `Used: ${round(used)} of ${meter.limit} ${meter.unit} (${pct.toFixed(1)}%).`,
    `Period: ${periodText(meter, now)}.`,
  ];
  const projected = projectedAtPeriodEnd(meter, used, now);
  if (projected !== null) {
    lines.push(`At this pace: about ${round(Math.round(projected))} ${meter.unit} by the period's end (${percentUsed(projected, meter.limit).toFixed(0)}%).`);
  }
  if (meter.id === "vercel_cpu" || meter.id === "vercel_invocations") {
    lines.push("Counts the scheduled jobs only; members' page views add to Vercel's own figure on its Usage page.");
  }
  if (hold.hold) lines.push("", `Held: ${hold.reason}`);
  else if (meter.holds && threshold < HOLD_PERCENT && meter.noExemption) lines.push("", `The scheduled jobs stop at ${HOLD_PERCENT}%, except for an urgent fix you approve.`);
  else if (meter.holds && threshold < HOLD_PERCENT) lines.push("", `Further use is held at ${HOLD_PERCENT}%, except in a monthly limit's last ${EXEMPT_LAST_DAYS} days or for an urgent fix you approve.`);
  else lines.push("", hold.reason);
  return { subject: `GSPS usage: ${meter.label} at ${threshold}%`, text: lines.join("\n") };
}

function periodText(meter: UsageMeter, now: Date): string {
  const period = periodOf(meter, now);
  switch (meter.period) {
    case "month":
      return `the month from ${formatEt(period.start)} to ${formatEt(period.end!)}`;
    case "day":
      return `the day from ${formatEt(period.start)} to ${formatEt(period.end!)}`;
    case "rolling24h":
      return "the last 24 hours";
    case "none":
      return "total size, not a period";
  }
}
