/**
 * The numbers the Q1 decision gate is read on (ROADMAP.md "Decision gates":
 * after Q1, continue or pivot on retention and revenue, target 70%+
 * first-cohort retention and 25+ paying users; and its North Star table).
 * docs/SYNTHESIZED_ROADMAP.md Part 5 item 17. Read by
 * /api/admin/decision-gate, which only the scheduled jobs' secret opens.
 *
 * Definitions, as the roadmap states them, with the readings GSPS can make:
 * - Active (30 days): signed in, or placed an order, in the last 30 days.
 *   Demo accounts are left out throughout.
 * - First-cohort retention: of members who joined more than 30 days ago, the
 *   share active now.
 * - Monthly retention: active members over all members.
 * - Feature adoption: of active members, the share with a filled order in
 *   the last 30 days ("executing ≥1 trade per month").
 * - Paying users: members with a Stripe subscription on their profile.
 * - Signal quality: the forward test's evaluated signals over 90 days
 *   (`shadow_signals`, lib/shadow/evaluate.ts): win rate (R above 0) and
 *   average R. It enters on the reaction and exits on Gann's rules, as
 *   production does; the roadmap's "within 5 days" is not what it measures,
 *   and that is said beside the number, not hidden.
 * - Alert delivery: deliveries recorded in 30 days, the share sent, and the
 *   median seconds from record to sent (the North Star's signal latency).
 *
 * Three-question basis: 1. Gann: none; operations. 2. Cycles: the 30- and
 * 90-day windows are the roadmap's and an engineering figure, no periodicity
 * claim. 3. Hermetic: Correspondence, the decision is read from the same rows
 * the product writes, never from a separate tally. Law of Creation: a mixture.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DecisionGateReport {
  generatedAt: string;
  members: number;
  active30: number;
  monthlyRetentionPct: number | null;
  cohort: number;
  cohortActive: number;
  firstCohortRetentionPct: number | null;
  activeTraders: number;
  featureAdoptionPct: number | null;
  payingUsers: number;
  signal: { evaluated: number; winRatePct: number | null; averageR: number | null; note: string };
  delivery: { recorded: number; sent: number; sentPct: number | null; medianLatencySeconds: number | null };
  targets: { firstCohortRetentionPct: 70; payingUsers: 25; monthlyRetentionPct: 80; featureAdoptionPct: 60; winRatePct: 65 };
}

const DAY = 86_400_000;

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function buildDecisionGateReport(service: SupabaseClient, now: Date = new Date()): Promise<DecisionGateReport> {
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const since90 = new Date(now.getTime() - 90 * DAY).toISOString();

  const { data: profileRows, error: profileError } = await service
    .from("profiles")
    .select("id, created_at, is_demo, stripe_subscription_id");
  if (profileError) throw new Error(`profiles not read: ${profileError.message}`);
  const members = ((profileRows ?? []) as { id: string; created_at: string; is_demo: boolean | null; stripe_subscription_id: string | null }[]).filter(
    (p) => !p.is_demo,
  );
  const memberIds = new Set(members.map((m) => m.id));

  const lastSignIn = new Map<string, string | null>();
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`users not listed: ${error.message}`);
    for (const u of data.users) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 200) break;
  }

  const { data: orderRows, error: orderError } = await service
    .from("orders")
    .select("user_id, status")
    .gte("created_at", since30)
    .limit(20_000);
  if (orderError) throw new Error(`orders not read: ${orderError.message}`);
  const orders = (orderRows ?? []) as { user_id: string; status: string }[];

  const active = new Set<string>();
  for (const m of members) {
    const at = lastSignIn.get(m.id);
    if (at && at >= since30) active.add(m.id);
  }
  for (const o of orders) if (memberIds.has(o.user_id)) active.add(o.user_id);
  const traders = new Set(
    orders.filter((o) => active.has(o.user_id) && (o.status === "filled" || o.status === "partially_filled")).map((o) => o.user_id),
  );

  const cohort = members.filter((m) => m.created_at < since30);
  const cohortActive = cohort.filter((m) => active.has(m.id)).length;

  const { data: shadowRows } = await service
    .from("shadow_signals")
    .select("r_multiple")
    .not("outcome", "is", null)
    .gte("evaluated_at", since90)
    .limit(20_000);
  const rs = ((shadowRows ?? []) as { r_multiple: number | string | null }[])
    .map((r) => (r.r_multiple == null ? null : Number(r.r_multiple)))
    .filter((r): r is number => r != null && Number.isFinite(r));

  const [{ count: recorded }, { data: sentRows }] = await Promise.all([
    service.from("notification_deliveries").select("id", { count: "exact", head: true }).gte("created_at", since30),
    service
      .from("notification_deliveries")
      .select("created_at, updated_at")
      .eq("status", "sent")
      .gte("created_at", since30)
      .limit(20_000),
  ]);
  const sent = (sentRows ?? []) as { created_at: string; updated_at: string }[];
  const latency = median(sent.map((r) => (Date.parse(r.updated_at) - Date.parse(r.created_at)) / 1000).filter((s) => s >= 0));

  return {
    generatedAt: now.toISOString(),
    members: members.length,
    active30: active.size,
    monthlyRetentionPct: pct(active.size, members.length),
    cohort: cohort.length,
    cohortActive,
    firstCohortRetentionPct: pct(cohortActive, cohort.length),
    activeTraders: traders.size,
    featureAdoptionPct: pct(traders.size, active.size),
    payingUsers: members.filter((m) => m.stripe_subscription_id).length,
    signal: {
      evaluated: rs.length,
      winRatePct: pct(rs.filter((r) => r > 0).length, rs.length),
      averageR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 1000) / 1000 : null,
      note: "Forward test, 90 days: reaction entry and the method's exits, not the roadmap's 5-day window. Too few signals to read as an edge until it holds hundreds.",
    },
    delivery: {
      recorded: recorded ?? 0,
      sent: sent.length,
      sentPct: pct(sent.length, recorded ?? 0),
      medianLatencySeconds: latency == null ? null : Math.round(latency * 100) / 100,
    },
    targets: { firstCohortRetentionPct: 70, payingUsers: 25, monthlyRetentionPct: 80, featureAdoptionPct: 60, winRatePct: 65 },
  };
}
