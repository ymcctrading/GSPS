/**
 * What each automation activation on `/automation` actually holds: an open
 * position, an entry still waiting, or a plan that ended before it filled.
 *
 * Until 2026-10-23 the page listed every `active` automation profile as an
 * "active algorithmic deployment", with only its symbol, side, mode and risk.
 * A profile stays `active` after its plan expires unfilled, so the owner's
 * account showed three "active trades" when the engine held none: AAPL refused
 * at placement, BP expired before the reaction back to its level, and FROG
 * still waiting for it. Gann keeps a record of every trade and reads it back;
 * a list that cannot tell a trade from an order that never filled is not that
 * record.
 *
 * The chain read: profile → its plan → orders placed from the plan
 * (`orders.source_plan_id`) → the filled entry's exit row
 * (`protocol_exits.entry_order_id`), whose stop is the one the exit manager
 * keeps today (`applied_stop`, else the plan's stop). Nothing here changes a
 * profile, a plan or an order; it only reads them.
 *
 * Three-question basis: 1. No new Gann rule: the stop, TP1 and MTP shown are
 * the ones his rules set elsewhere. 2. No periodicity claim. 3. Cause and
 * Effect: each row names what the plan caused (a fill, a wait, or nothing).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMINAL_STATES, type PlanState } from "@/lib/lifecycle/types";

export type DeploymentStatus = "open" | "waiting" | "closed" | "ended";

export interface Deployment {
  profileId: string;
  symbol: string;
  direction: "bullish" | "bearish";
  executionMode: "paper" | "live";
  status: DeploymentStatus;
  planState: string;
  /** The plan's entry, stop, first target and master take profit. */
  entry: number | null;
  stop: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  /** Filled entries only. */
  fillPrice: number | null;
  qty: number | null;
  filledAt: string | null;
  /** A resting order's limit, when one is working. */
  restingLimit: number | null;
  /** The latest reason the engine gave for not placing or filling it. */
  lastReason: string | null;
  expiresAt: string | null;
}

export interface ProfileRow {
  profile_id: string;
  plan_id: string;
  execution_mode: "paper" | "live";
}
export interface PlanRow {
  plan_id: string;
  instrument: string;
  direction: "bullish" | "bearish";
  state: string;
  entry_trigger: number | string | null;
  invalidation: number | string | null;
  take_profit_1: number | string | null;
  master_profit: number | string | null;
  expires_at: string | null;
}
export interface OrderRow {
  id: string;
  source_plan_id: string | null;
  status: string;
  limit_price: number | string | null;
  filled_avg_price: number | string | null;
  filled_qty: number | string | null;
  qty: number | string | null;
  created_at: string;
}
export interface ExitRow {
  entry_order_id: string | null;
  status: string;
  qty: number | string | null;
  entry_price: number | string | null;
  stop_loss: number | string | null;
  applied_stop: number | string | null;
  take_profit_1: number | string | null;
  master_profit: number | string | null;
  created_at: string;
}
export interface ReasonRow {
  profile_id: string;
  kind: string;
  detail: unknown;
  created_at: string;
}

const RESTING_ORDER = new Set(["new", "accepted", "pending_new"]);

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function reasonOf(row: ReasonRow): string | null {
  const d = row.detail as { reason?: unknown; reasons?: unknown } | null;
  if (typeof d?.reason === "string") return d.reason;
  if (Array.isArray(d?.reasons)) return d.reasons.filter((r) => typeof r === "string").join(" ") || null;
  return null;
}

/** One profile's row, from the rows read for it. Pure. */
export function classifyDeployment(
  profile: ProfileRow,
  plan: PlanRow,
  orders: OrderRow[],
  exits: ExitRow[],
  reasons: ReasonRow[],
): Deployment {
  const own = orders.filter((o) => o.source_plan_id === plan.plan_id);
  const filled = own
    .filter((o) => (o.status === "filled" || o.status === "partially_filled") && (num(o.filled_qty) ?? 0) > 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const exit = filled ? exits.find((e) => e.entry_order_id === filled.id) : undefined;
  const resting = own.find((o) => RESTING_ORDER.has(o.status) && o !== filled);
  // A refusal older than the latest placement no longer explains the wait.
  const placedAt = [
    ...reasons.filter((r) => r.kind === "broker_order_submitted").map((r) => r.created_at),
    ...(resting ? [resting.created_at] : []),
  ].sort().at(-1);
  const latest =
    [...reasons]
      .filter((r) => r.kind !== "broker_order_submitted" && (!placedAt || r.created_at > placedAt))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(reasonOf)
      .find((r) => r) ?? null;

  let status: DeploymentStatus;
  if (filled) status = exit && exit.status !== "working" ? "closed" : "open";
  else if (resting || !TERMINAL_STATES.includes(plan.state as PlanState)) status = "waiting";
  else status = "ended";

  return {
    profileId: profile.profile_id,
    symbol: plan.instrument,
    direction: plan.direction,
    executionMode: profile.execution_mode,
    status,
    planState: plan.state,
    entry: num(plan.entry_trigger),
    stop: num(exit?.applied_stop) ?? num(exit?.stop_loss) ?? num(plan.invalidation),
    takeProfit1: num(exit?.take_profit_1) ?? num(plan.take_profit_1),
    masterProfit: num(exit?.master_profit) ?? num(plan.master_profit),
    fillPrice: filled ? (num(exit?.entry_price) ?? num(filled.filled_avg_price)) : null,
    qty: filled ? (num(exit?.qty) ?? num(filled.filled_qty)) : null,
    // The exit row is written at the fill; the order's own row at placement.
    filledAt: filled ? (exit?.created_at ?? filled.created_at) : null,
    restingLimit: resting ? num(resting.limit_price) : null,
    lastReason: status === "waiting" || status === "ended" ? latest : null,
    expiresAt: plan.expires_at,
  };
}

const STATUS_ORDER: Record<DeploymentStatus, number> = { open: 0, waiting: 1, closed: 2, ended: 3 };

/**
 * Every active automation profile of `userId`, read through to its fill. A
 * failed read returns `error` instead of a list that would wrongly say nothing
 * is open.
 */
export async function loadDeployments(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: Deployment[]; error: string | null }> {
  const { data: profileData, error: profileError } = await supabase
    .from("automation_profiles")
    .select("profile_id, plan_id, execution_mode")
    .eq("user_id", userId)
    .eq("status", "active");
  if (profileError) return { rows: [], error: profileError.message };
  const profiles = (profileData ?? []) as ProfileRow[];
  if (profiles.length === 0) return { rows: [], error: null };
  const planIds = profiles.map((p) => p.plan_id);
  const profileIds = profiles.map((p) => p.profile_id);

  const [planRes, orderRes, reasonRes] = await Promise.all([
    supabase
      .from("trade_plans")
      .select("plan_id, instrument, direction, state, entry_trigger, invalidation, take_profit_1, master_profit, expires_at")
      .in("plan_id", planIds),
    supabase
      .from("orders")
      .select("id, source_plan_id, status, limit_price, filled_avg_price, filled_qty, qty, created_at")
      .eq("user_id", userId)
      .in("source_plan_id", planIds),
    supabase
      .from("automation_events")
      .select("profile_id, kind, detail, created_at")
      .in("profile_id", profileIds)
      .in("kind", ["broker_order_rejected", "order_blocked", "broker_order_submitted"])
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, 50 * profileIds.length)),
  ]);
  const failed = planRes.error ?? orderRes.error ?? reasonRes.error;
  if (failed) return { rows: [], error: failed.message };
  const orders = (orderRes.data ?? []) as OrderRow[];
  const filledIds = orders.filter((o) => o.status === "filled" || o.status === "partially_filled").map((o) => o.id);
  let exits: ExitRow[] = [];
  if (filledIds.length > 0) {
    const exitRes = await supabase
      .from("protocol_exits")
      .select("entry_order_id, status, qty, entry_price, stop_loss, applied_stop, take_profit_1, master_profit, created_at")
      .eq("user_id", userId)
      .in("entry_order_id", filledIds);
    if (exitRes.error) return { rows: [], error: exitRes.error.message };
    exits = (exitRes.data ?? []) as ExitRow[];
  }
  const plans = new Map(((planRes.data ?? []) as PlanRow[]).map((p) => [p.plan_id, p]));
  const reasons = (reasonRes.data ?? []) as ReasonRow[];

  const rows = profiles
    .map((profile) => {
      const plan = plans.get(profile.plan_id);
      if (!plan) return null;
      return classifyDeployment(
        profile,
        plan,
        orders,
        exits,
        reasons.filter((r) => r.profile_id === profile.profile_id),
      );
    })
    .filter((d): d is Deployment => d !== null)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.symbol.localeCompare(b.symbol));
  return { rows, error: null };
}
