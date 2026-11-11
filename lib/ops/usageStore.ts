/**
 * GSPS — reads and writes the usage meter's rows (migration 0133) and sends the
 * owner's threshold alerts. The rules are in `usageLimits.ts`; this module only
 * reads what each meter has used and acts on what that module decides.
 *
 * Sources:
 * - GitHub Actions minutes and Vercel deployments: `usage_events`, reported by
 *   the CI jobs themselves (every job's last step), plus any reconciliation
 *   reading posted from a measured count.
 * - Email: `email_daily_budget`, the send ledger every email reserves a slot in.
 * - The database: `usage_database_bytes()`; its connections, file storage and
 *   monthly active users: `usage_supabase()`.
 * - Alpaca's per-minute allowance: the month's largest `alpaca_rate` event
 *   (`usage_max()`), each the busiest minute a scan saw (`rateUsage.ts`).
 * - Vercel function CPU and calls: the month's `vercel_function` rows
 *   (`usage_function_totals()`), one per scheduled route per day, written by
 *   `functionMeter.ts`.
 *
 * Alerts go to the owner's addresses by email (kind "ops"), one per meter per
 * reading, naming the highest threshold crossed; every crossed threshold is
 * then marked sent for the period. A failed send leaves them unmarked, so the
 * next reading tries again.
 */

import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { ownerReportRecipients } from "@/lib/auth/owner";
import { emailBudgetHold } from "@/lib/notifications/email-budget";
import { fromHeader, sandboxBlockReason } from "@/lib/notifications/resend-handler";
import {
  PUBLIC_REPO_REASON,
  USAGE_METERS,
  alertsDue,
  holdDecision,
  meterBilled,
  hostPlatform,
  meterOnHost,
  offHostReason,
  percentUsed,
  periodOf,
  projectedAtPeriodEnd,
  renderAlert,
  visibilityFromGithub,
  type HoldDecision,
  type RepoVisibility,
  type UsageMeter,
  type UsageMeterId,
} from "@/lib/ops/usageLimits";

type Service = ReturnType<typeof createServiceClient>;

export interface MeterStatus {
  meter: UsageMeterId;
  label: string;
  used: number;
  limit: number;
  unit: string;
  percent: number;
  hold: HoldDecision;
  /** Null when the reading could not be made. */
  error: string | null;
  /** False while the limit doesn't apply (Actions on a public repository): no alert, no hold. */
  billed: boolean;
  /** A monthly meter's use carried at its current pace to the period's end; null otherwise. */
  projected: number | null;
}

const VISIBILITY_TTL_MS = 10 * 60_000;
let visibilityRead: { at: number; value: Promise<RepoVisibility> } | null = null;

/**
 * The repository's visibility, read from GitHub without a token (a private
 * repository answers 404) and kept 10 minutes, so an hourly check and a burst
 * of CI reports make a handful of requests. Unknown on any failure.
 */
export function repositoryVisibility(now: Date = new Date()): Promise<RepoVisibility> {
  if (visibilityRead && now.getTime() - visibilityRead.at < VISIBILITY_TTL_MS) return visibilityRead.value;
  const owner = process.env.VERCEL_GIT_REPO_OWNER || "ymcctrading";
  const slug = process.env.VERCEL_GIT_REPO_SLUG || "gsps";
  const value = (async (): Promise<RepoVisibility> => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${slug}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "gsps-usage-meter" },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      return visibilityFromGithub(res.status, res.status === 200 ? await res.json() : null);
    } catch {
      return "unknown";
    }
  })();
  visibilityRead = { at: now.getTime(), value };
  return value;
}

/** Records one use. Idempotent on `key`. */
export async function recordUsage(
  service: Service,
  event: { meter: "github_actions" | "vercel_deployments" | "alpaca_rate" | "vercel_function"; units: number; key: string; detail?: Record<string, unknown>; occurredAt?: Date },
): Promise<{ recorded: boolean; error: string | null }> {
  const { error } = await service.from("usage_events").insert({
    meter: event.meter,
    units: event.units,
    key: event.key,
    detail: event.detail ?? null,
    occurred_at: (event.occurredAt ?? new Date()).toISOString(),
  });
  if (!error) return { recorded: true, error: null };
  // A repeated key is the same use reported twice.
  if (error.code === "23505") return { recorded: false, error: null };
  return { recorded: false, error: error.message };
}

async function sumEvents(service: Service, meter: UsageMeter, now: Date): Promise<number> {
  const { start } = periodOf(meter, now);
  // Summed in the database: a month of CI jobs is past the API's 1,000-row page.
  const { data, error } = await service.rpc("usage_sum", { p_meter: meter.id, p_since: start.toISOString(), p_until: now.toISOString() });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

async function emailUsed(service: Service, meter: UsageMeter, now: Date): Promise<number> {
  const { start, end } = periodOf(meter, now);
  const { data, error } = await service
    .from("email_daily_budget")
    .select("sent")
    .gte("day", start.toISOString().slice(0, 10))
    .lt("day", end!.toISOString().slice(0, 10));
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.sent ?? 0), 0);
}

async function maxEvent(service: Service, meter: UsageMeter, now: Date): Promise<number> {
  const { start } = periodOf(meter, now);
  const { data, error } = await service.rpc("usage_max", { p_meter: meter.id, p_since: start.toISOString(), p_until: now.toISOString() });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

type SupabaseCounts = { connections: number; storageMb: number; mau: number };

// One `usage_supabase()` call serves all three meters of a check: the check
// reads them with the same client and clock.
const supabaseCountsRead = new WeakMap<Service, { at: number; counts: Promise<SupabaseCounts> }>();

function supabaseCounts(service: Service, now: Date): Promise<SupabaseCounts> {
  const cached = supabaseCountsRead.get(service);
  if (cached && cached.at === now.getTime()) return cached.counts;
  const counts = (async () => {
    const { data, error } = await service.rpc("usage_supabase");
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as { connections?: unknown; storage_bytes?: unknown; mau?: unknown };
    return { connections: Number(row.connections ?? 0), storageMb: Number(row.storage_bytes ?? 0) / 1_000_000, mau: Number(row.mau ?? 0) };
  })();
  supabaseCountsRead.set(service, { at: now.getTime(), counts });
  return counts;
}

type FunctionTotals = { cpuMinutes: number; invocations: number; wallSeconds: number };

// One `usage_function_totals()` call serves both Vercel function meters of a
// check: the check reads them with the same client and clock.
const functionTotalsRead = new WeakMap<Service, { at: number; totals: Promise<FunctionTotals> }>();

function functionTotals(service: Service, meter: UsageMeter, now: Date): Promise<FunctionTotals> {
  const cached = functionTotalsRead.get(service);
  if (cached && cached.at === now.getTime()) return cached.totals;
  const { start } = periodOf(meter, now);
  const totals = (async () => {
    const { data, error } = await service.rpc("usage_function_totals", { p_since: start.toISOString(), p_until: now.toISOString() });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { cpu_minutes?: unknown; invocations?: unknown; wall_seconds?: unknown } | null;
    return {
      cpuMinutes: Number(row?.cpu_minutes ?? 0),
      invocations: Number(row?.invocations ?? 0),
      wallSeconds: Number(row?.wall_seconds ?? 0),
    };
  })();
  functionTotalsRead.set(service, { at: now.getTime(), totals });
  return totals;
}

const METADATA = "http://metadata.google.internal/computeMetadata/v1";

/**
 * The service's billable instance-seconds this period, from Cloud Monitoring
 * (`run.googleapis.com/container/billable_instance_time`), read with the
 * container's own service account through the metadata server. Throws when
 * any read fails, so the meter reads "Unread" and holds nothing.
 */
async function cloudRunBillableSeconds(meter: UsageMeter, now: Date): Promise<number> {
  const headers = { "Metadata-Flavor": "Google" };
  const projectRes = await fetch(`${METADATA}/project/project-id`, { headers, signal: AbortSignal.timeout(3000) });
  if (!projectRes.ok) throw new Error(`metadata project ${projectRes.status}`);
  const project = (await projectRes.text()).trim();
  const tokenRes = await fetch(`${METADATA}/instance/service-accounts/default/token`, { headers, signal: AbortSignal.timeout(3000) });
  if (!tokenRes.ok) throw new Error(`metadata token ${tokenRes.status}`);
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) throw new Error("metadata token empty");
  return sumBillableSeconds(project, token, periodOf(meter, now).start, now);
}

async function sumBillableSeconds(project: string, token: string, start: Date, now: Date): Promise<number> {
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(project)}/timeSeries`);
  url.searchParams.set("filter", 'metric.type="run.googleapis.com/container/billable_instance_time" AND resource.type="cloud_run_revision"');
  url.searchParams.set("interval.startTime", start.toISOString());
  url.searchParams.set("interval.endTime", now.toISOString());
  // One bucket for the whole period, summed across revisions and instances.
  url.searchParams.set("aggregation.alignmentPeriod", `${Math.max(60, Math.ceil((now.getTime() - start.getTime()) / 1000))}s`);
  url.searchParams.set("aggregation.perSeriesAligner", "ALIGN_SUM");
  url.searchParams.set("aggregation.crossSeriesReducer", "REDUCE_SUM");
  let total = 0;
  let pageToken = "";
  do {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`monitoring ${res.status}`);
    const body = (await res.json()) as { timeSeries?: { points?: { value?: { doubleValue?: number; int64Value?: string } }[] }[]; nextPageToken?: string };
    for (const series of body.timeSeries ?? []) {
      for (const point of series.points ?? []) {
        const v = Number(point.value?.doubleValue ?? point.value?.int64Value ?? 0);
        if (Number.isFinite(v) && v > 0) total += v;
      }
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return total;
}

async function databaseMb(service: Service): Promise<number> {
  const { data, error } = await service.rpc("usage_database_bytes");
  if (error) throw new Error(error.message);
  return Number(data ?? 0) / 1_000_000;
}

/** What a meter has used in its current period. */
export async function readUsed(service: Service, meter: UsageMeter, now: Date): Promise<number> {
  switch (meter.id) {
    case "github_actions":
    case "vercel_deployments":
      return sumEvents(service, meter, now);
    case "email_daily":
    case "email_monthly":
      return emailUsed(service, meter, now);
    case "supabase_db":
      return databaseMb(service);
    case "supabase_connections":
      return (await supabaseCounts(service, now)).connections;
    case "supabase_storage":
      return (await supabaseCounts(service, now)).storageMb;
    case "supabase_mau":
      return (await supabaseCounts(service, now)).mau;
    case "alpaca_rate":
      return maxEvent(service, meter, now);
    case "vercel_cpu":
      return (await functionTotals(service, meter, now)).cpuMinutes;
    case "vercel_invocations":
      return (await functionTotals(service, meter, now)).invocations;
    case "cloud_run_seconds":
      return cloudRunBillableSeconds(meter, now);
  }
}

async function activeOverride(service: Service, meter: UsageMeterId, now: Date): Promise<{ until: Date; reason: string } | null> {
  const { data, error } = await service
    .from("usage_overrides")
    .select("until, reason")
    .eq("meter", meter)
    .gt("until", now.toISOString())
    .order("until", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { until: new Date(data[0].until as string), reason: String(data[0].reason) };
}

/** One meter's reading and whether it holds. A reading that fails holds nothing. */
export async function meterStatus(service: Service, id: UsageMeterId, now: Date): Promise<MeterStatus> {
  const meter = USAGE_METERS[id];
  // A function meter for the other host is not read at all (Cloud Run's
  // reading needs its metadata server); it reports what the site uses now.
  if (!meterOnHost(id, hostPlatform())) {
    return { meter: id, label: meter.label, used: 0, limit: meter.limit, unit: meter.unit, percent: 0, hold: { hold: false, reason: offHostReason(id, hostPlatform()) }, error: null, billed: false, projected: null };
  }
  try {
    const used = await readUsed(service, meter, now);
    const billed = id === "github_actions" ? meterBilled(id, await repositoryVisibility(now)) : true;
    const hold = billed ? holdDecision(meter, used, now, await activeOverride(service, id, now)) : { hold: false, reason: PUBLIC_REPO_REASON };
    return { meter: id, label: meter.label, used, limit: meter.limit, unit: meter.unit, percent: percentUsed(used, meter.limit), hold, error: null, billed, projected: projectedAtPeriodEnd(meter, used, now) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fails open: the meter's own outage never stops CI or a deploy.
    return { meter: id, label: meter.label, used: 0, limit: meter.limit, unit: meter.unit, percent: 0, hold: { hold: false, reason: `Unread: ${message}` }, error: message, billed: true, projected: null };
  }
}

/** Keeps the meter's latest reading for anyone who reads the hold without the secret. */
export async function saveReading(service: Service, status: MeterStatus, now: Date): Promise<void> {
  if (status.error) return;
  const { error } = await service.from("usage_readings").upsert({
    meter: status.meter,
    used: status.used,
    usage_limit: status.limit,
    percent: Number(status.percent.toFixed(2)),
    hold: status.hold.hold,
    reason: status.hold.reason,
    read_at: now.toISOString(),
  });
  if (error) console.error("[usage] reading not saved:", error.message);
}

/** Sends any threshold alerts due for this reading. Returns the thresholds sent. */
export async function sendDueAlerts(service: Service, status: MeterStatus, now: Date): Promise<{ sent: number[]; error: string | null }> {
  if (status.error || !status.billed) return { sent: [], error: null };
  const meter = USAGE_METERS[status.meter];
  const period = periodOf(meter, now);
  const { data: rows, error: readError } = await service
    .from("usage_alerts")
    .select("threshold, sent_at, period_key")
    .eq("meter", meter.id)
    .gte("sent_at", new Date(now.getTime() - 40 * 86_400_000).toISOString());
  if (readError) return { sent: [], error: readError.message };
  const sentRows = (rows ?? [])
    .filter((r) => meter.period === "rolling24h" || r.period_key === period.key)
    .map((r) => ({ threshold: Number(r.threshold), sentAt: new Date(r.sent_at as string) }));
  const due = alertsDue(status.percent, sentRows, meter, now);
  if (due.length === 0) return { sent: [], error: null };

  const top = due[due.length - 1];
  const mail = renderAlert({ meter, used: status.used, now }, top, status.hold);
  const sendError = await emailOwner(mail, `usage-${meter.id}-${period.key}-${top}-${now.toISOString().slice(0, 13)}`);
  if (sendError) return { sent: [], error: sendError };

  // Upsert, not insert: a rolling window's threshold re-sends a day later
  // under the same period key.
  const { error: writeError } = await service
    .from("usage_alerts")
    .upsert(due.map((threshold) => ({ meter: meter.id, period_key: period.key, threshold, used: status.used, sent_at: now.toISOString() })));
  return { sent: due, error: writeError?.message ?? null };
}

async function emailOwner(mail: { subject: string; text: string }, idempotencyKey: string): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY is not set.";
  const to = ownerReportRecipients().filter((e) => !sandboxBlockReason(e));
  if (to.length === 0) return "No owner address can be sent to.";
  const budget = await emailBudgetHold("ops");
  if (budget) return budget;
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(mail.text)}</pre>`;
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
    { from: fromHeader("GSPS Usage"), to, subject: mail.subject, text: mail.text, html },
    { idempotencyKey },
  );
  return result.error?.message ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
