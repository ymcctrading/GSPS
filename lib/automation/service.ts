/**
 * GSPS Automation: the server-side authority for the Wall-Street-only,
 * plan-scoped automation model in the "GSPS Implementation Brief"
 * single-source-of-truth spec pack (2026-08-31).
 *
 * "The scan itself must never activate live execution or submit an order."
 * The member deliberately activates one automation profile against one
 * already ENTRY_CONFIRMED candidate plan, in paper or live mode; this
 * module resolves every order term server-side from that profile and its
 * linked plan and never accepts raw ticker/side/price/stop/quantity from a
 * caller.
 *
 * Distinct from `components/automation/control-panel.tsx`'s pre-existing
 * autonomous manager (`user_automation_profiles`) -- see
 * 0051_gsps_automation_profiles.sql's header for why both exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { getTradePlan } from "@/lib/lifecycle/store";
import type { TradePlan } from "@/lib/lifecycle/types";
import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

export type ExecutionMode = "paper" | "live";
export type AutomationMode = "system_plan" | "guided_custom";

export interface AutomationConfiguration {
  /**
   * Dollar risk to allocate to this one trade — the only member-supplied
   * number that reaches order sizing, and only through this bounded field
   * (never a raw quantity). Required for both automation modes; validated
   * against a hard ceiling below rather than trusted as-is.
   */
  allocatedDollarRisk: number;
}

/** Hard ceiling on member-supplied per-trade allocation. Config outside this is rejected server-side. */
const MAX_ALLOCATED_DOLLAR_RISK = 50_000;

export interface EligiblePlanCheck {
  eligible: boolean;
  blockReasons: string[];
}

/**
 * A plan is eligible for automation only once it has cleared the mandatory
 * entry-confirmation gate — `armed` or later, pre-close, and not expired/
 * invalidated/superseded. This mirrors `entryReady`'s intent at the plan
 * level: "an invalidated, expired, stale, superseded, or otherwise
 * ineligible plan cannot be automated."
 */
export function checkPlanEligibleForAutomation(plan: TradePlan, now: Date = new Date()): EligiblePlanCheck {
  const reasons: string[] = [];
  const eligibleStates: TradePlan["state"][] = [
    "armed",
    "entered",
    "tp1_reached",
    "tp2_reached",
    "master_reached",
    "runner",
  ];
  if (!eligibleStates.includes(plan.state)) {
    reasons.push(
      plan.state === "awaiting_entry_confirmation"
        ? "Entry not yet confirmed — the break/retest/confirmation-move sequence has not completed."
        : `Plan is in state "${plan.state}", not eligible for automation.`,
    );
  }
  if (new Date(plan.expiresAt).getTime() < now.getTime() && plan.state === "armed") {
    reasons.push("Plan has expired.");
  }
  return { eligible: reasons.length === 0, blockReasons: reasons };
}

export interface ActivateAutomationResult {
  ok: boolean;
  profileId?: string;
  error?: string;
}

/**
 * Creates and activates one automation profile. Requires Wall Street
 * entitlement (`automationEnabled`) and an eligible, entry-confirmed plan
 * owned by the same user. `execution_mode` is fixed here and never
 * changed by any later call — "an active automation profile's mode must
 * be immutable."
 */
export async function activateAutomationProfile(
  supabase: SupabaseClient,
  userId: string,
  args: {
    planId: string;
    automationMode: AutomationMode;
    executionMode: ExecutionMode;
    configuration: AutomationConfiguration;
  },
): Promise<ActivateAutomationResult> {
  const policy = await getUserEntitlementPolicy(supabase, userId);
  if (!policy.automationEnabled) {
    return { ok: false, error: "Automation requires Wall Street entitlement." };
  }

  if (
    !Number.isFinite(args.configuration.allocatedDollarRisk) ||
    args.configuration.allocatedDollarRisk <= 0 ||
    args.configuration.allocatedDollarRisk > MAX_ALLOCATED_DOLLAR_RISK
  ) {
    return { ok: false, error: "allocatedDollarRisk is out of the GSPS-approved schema range." };
  }

  const plan = await getTradePlan(supabase, userId, args.planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  if (plan.market !== "us_equity") {
    return { ok: false, error: `Automation is not yet supported for market "${plan.market}".` };
  }

  const eligibility = checkPlanEligibleForAutomation(plan);
  if (!eligibility.eligible) {
    return { ok: false, error: eligibility.blockReasons.join(" ") };
  }

  const { data, error } = await supabase
    .from("automation_profiles")
    .insert({
      user_id: userId,
      plan_id: args.planId,
      automation_mode: args.automationMode,
      execution_mode: args.executionMode,
      status: "active",
      configuration: args.configuration,
    })
    .select("profile_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const profileId = data.profile_id as string;
  await recordAutomationEvent(supabase, userId, profileId, "activated", {
    planId: args.planId,
    executionMode: args.executionMode,
  });

  // Activation only ever succeeds against an already-`armed`-or-later
  // (entry-confirmed) plan (see checkPlanEligibleForAutomation above), so
  // there is no separate "wait for the trigger" step for this simplified
  // model — the member's deliberate activation IS the trigger. A future
  // pass that lets a member automate a plan still `awaiting_entry_
  // confirmation` (queued for when it arms) would need a poller; the
  // Vercel Hobby cron cap makes that a real-time job for the scan
  // pipeline's own cadence to drive instead, not a separate schedule —
  // tracked as a follow-up rather than blocking activation of already-
  // ready plans.
  if (plan.state === "armed") {
    await authorizeAutomatedOrder(supabase, userId, profileId);
  }

  return { ok: true, profileId };
}

export async function pauseAutomationProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("automation_profiles")
    .update({ status: "paused", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  await recordAutomationEvent(supabase, userId, profileId, "paused", {});
  return { ok: true };
}

export async function stopAutomationProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("automation_profiles")
    .update({ status: "stopped", stopped_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .in("status", ["active", "paused"]);
  if (error) return { ok: false, error: error.message };
  await recordAutomationEvent(supabase, userId, profileId, "stopped", {});
  return { ok: true };
}

interface AutomationProfileRow {
  profile_id: string;
  user_id: string;
  plan_id: string;
  automation_mode: AutomationMode;
  execution_mode: ExecutionMode;
  status: "active" | "paused" | "stopped" | "completed";
  configuration: AutomationConfiguration;
}

export interface AuthorizeAutomatedOrderResult {
  authorized: boolean;
  reason?: string;
  orderId?: string;
}

/**
 * `authorizeAutomatedOrder(profileId)` — the pre-trade gate the spec
 * requires. The caller supplies only `profileId`; every order term is
 * resolved here from the profile's own row and its linked, re-checked
 * plan. Delegates the actual submission to `placeSimulatedOrder`, the same
 * path manual tickets and Guided Decision Mode use — same bracket checks,
 * same live circuit-breaker gate, same ledger writes.
 */
export async function authorizeAutomatedOrder(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<AuthorizeAutomatedOrderResult> {
  const { data: profileRow, error: profileErr } = await supabase
    .from("automation_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (profileErr) return { authorized: false, reason: profileErr.message };
  const profile = profileRow as AutomationProfileRow | null;
  if (!profile) return { authorized: false, reason: "Automation profile not found." };
  if (profile.status !== "active") {
    return { authorized: false, reason: `Automation profile is "${profile.status}", not active.` };
  }

  const policy = await getUserEntitlementPolicy(supabase, userId);
  if (!policy.automationEnabled) {
    return { authorized: false, reason: "Automation requires Wall Street entitlement." };
  }

  const plan = await getTradePlan(supabase, userId, profile.plan_id);
  if (!plan) return { authorized: false, reason: "Linked plan not found." };

  const eligibility = checkPlanEligibleForAutomation(plan);
  if (!eligibility.eligible) {
    await recordAutomationEvent(supabase, userId, profileId, "order_blocked", {
      reasons: eligibility.blockReasons,
    });
    return { authorized: false, reason: eligibility.blockReasons.join(" ") };
  }

  const order = deriveOrderInputFromPlan(plan, profile);
  if (!order.ok) {
    await recordAutomationEvent(supabase, userId, profileId, "order_blocked", { reason: order.error });
    return { authorized: false, reason: order.error };
  }

  await recordAutomationEvent(supabase, userId, profileId, "order_authorized", { symbol: plan.instrument });

  const result = await placeSimulatedOrder(supabase, userId, order.input);
  const succeeded = result.status >= 200 && result.status < 300;
  if (!succeeded) {
    const reason = typeof result.body.error === "string" ? result.body.error : `Order rejected (HTTP ${result.status}).`;
    await recordAutomationEvent(supabase, userId, profileId, "broker_order_rejected", { reason, status: result.status });
    return { authorized: false, reason };
  }

  await recordAutomationEvent(supabase, userId, profileId, "broker_order_submitted", {
    orderId: result.orderId ?? null,
  });
  return { authorized: true, orderId: result.orderId ?? undefined };
}

function deriveOrderInputFromPlan(
  plan: TradePlan,
  profile: AutomationProfileRow,
): { ok: true; input: OrderInput } | { ok: false; error: string } {
  const riskPerShare = Math.abs(plan.coordinates.entryTrigger - plan.coordinates.invalidation);
  if (riskPerShare <= 0) return { ok: false, error: "Plan has no positive per-share risk to size against." };

  const qty = Math.floor(profile.configuration.allocatedDollarRisk / riskPerShare);
  if (qty < 1) {
    return { ok: false, error: "Allocated risk is too small to size at least one share against this plan." };
  }

  return {
    ok: true,
    input: {
      symbol: plan.instrument,
      assetClass: "equity",
      side: plan.direction === "bullish" ? "buy" : "sell",
      qty,
      entryMode: "now",
      referencePrice: plan.coordinates.entryTrigger,
      attachLevels: {
        stopLoss: plan.coordinates.invalidation,
        takeProfit: plan.coordinates.takeProfit1,
        masterProfit: plan.coordinates.masterProfit ?? undefined,
      },
      mode: profile.execution_mode,
      intradaySourced: false,
    },
  };
}

async function recordAutomationEvent(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
  kind:
    | "activated"
    | "paused"
    | "resumed"
    | "stopped"
    | "order_intent_created"
    | "order_authorized"
    | "order_blocked"
    | "broker_order_submitted"
    | "broker_order_rejected"
    | "fill_recorded",
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("automation_events").insert({
    profile_id: profileId,
    user_id: userId,
    kind,
    detail,
  });
  if (error) console.error(`recordAutomationEvent: insert failed for ${profileId}/${kind} — ${error.message}`);
}
