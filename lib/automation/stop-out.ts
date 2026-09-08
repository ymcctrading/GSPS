/**
 * What happens once an automated position — placed by either the
 * plan-scoped GSPS Automation or the fully-autonomous Portfolio Manager,
 * both via lib/automation/service.ts's `deriveOrderInputFromPlan` — is
 * actually stopped out. Called from lib/trade/exit-manager-sim.ts (paper)
 * and lib/trade/exit-manager.ts (live) the moment a real stop-loss (not a
 * TP1 or master-target close) finishes a position, never on a pre-entry
 * scan rejection.
 *
 * Two things happen, in order:
 *
 * 1. The plan's own lifecycle is brought in line with reality. Automation
 *    places the order the instant a plan arms but never itself records
 *    "entered" (deriveOrderInputFromPlan reads `plan.coordinates` directly;
 *    nothing calls the `enter` transition) — done here, then the plan is
 *    closed out as `invalidated`, so its state machine reflects "this
 *    stopped out" instead of sitting at `armed` forever.
 *
 * 2. Only when the account has opted in (`user_automation_profiles
 *    .pivot_on_stop_out`), a fresh trade plan is seeded from that
 *    instrument's Pivot Plan — the opposite-direction contingency
 *    lib/strat/levels.ts and lib/scanner/intraday.ts already describe to a
 *    manual trader. This does NOT place a trade: the new plan starts at
 *    WATCHLIST and still has to independently clear the same mandatory
 *    break/retest/confirmation-move sequence
 *    (lib/lifecycle/entryConfirmation.ts) as any other plan before it can
 *    arm — a stop-out is never itself an entry signal, matching what Pivot
 *    Plan's own copy has always told a manual trader.
 *
 * Scoped to `market === "us_equity"`: that is the only market
 * lib/automation/service.ts's `activateAutomationProfile` supports today
 * (see its explicit check), so a pivot plan for any other market/asset
 * class would have nothing able to automate it — "if and when applicable."
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTradePlan, applyEventAndPersist, createOrGetIdempotentTradePlan } from "@/lib/lifecycle/store";
import { ACTIVE_STATES, type TradePlan } from "@/lib/lifecycle/types";
import { buildPivotTradePlanFromStoppedPlan } from "@/lib/lifecycle/fromPivot";

export interface StopOutArgs {
  planId: string;
  /** The plan's own fill price at entry — automation never recorded one, so this backfills it from the plan's own entry trigger. */
  entryFillPrice: number;
  /** When the stop actually fired. */
  stoppedAt: string;
  exitPrice: number;
}

export async function handleAutomatedStopOut(
  supabase: SupabaseClient,
  userId: string,
  args: StopOutArgs,
): Promise<void> {
  const plan = await getTradePlan(supabase, userId, args.planId);
  if (!plan) return;

  let current = plan;
  if (current.state === "armed") {
    const entered = await applyEventAndPersist(supabase, userId, args.planId, {
      type: "enter",
      at: args.stoppedAt,
      fillPrice: args.entryFillPrice,
      cooldownBlocksNewEntry: false,
    });
    if (!entered.ok) return;
    current = entered.plan;
  }
  if (!ACTIVE_STATES.includes(current.state)) return; // already closed some other way (e.g. a manual close raced this)

  const invalidated = await applyEventAndPersist(supabase, userId, args.planId, {
    type: "invalidate",
    at: args.stoppedAt,
    reason: `Automated position stopped out at ${args.exitPrice}.`,
  });
  if (!invalidated.ok) return;

  if (invalidated.plan.market !== "us_equity") return;

  const { data: profileRow } = await supabase
    .from("user_automation_profiles")
    .select("pivot_on_stop_out")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profileRow?.pivot_on_stop_out) return;

  await seedPivotTradePlan(supabase, userId, invalidated.plan, args.stoppedAt);
}

async function seedPivotTradePlan(
  supabase: SupabaseClient,
  userId: string,
  stoppedPlan: TradePlan,
  stoppedAt: string,
): Promise<void> {
  const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan, { generatedAt: stoppedAt });
  if (!input) return;

  const { plan: seeded, created } = await createOrGetIdempotentTradePlan(supabase, userId, input);
  if (!created) return; // already seeded for this exact stop-out

  const at = new Date().toISOString();
  const marked = await applyEventAndPersist(supabase, userId, seeded.planId, {
    type: "mark_auto_created",
    at,
    reason: `Auto-created from ${stoppedPlan.instrument}'s Pivot Plan after its ${stoppedPlan.direction} counterpart stopped out (pivot_on_stop_out).`,
  });
  if (!marked.ok) return;
  const qualified = await applyEventAndPersist(supabase, userId, seeded.planId, {
    type: "qualify",
    at,
    reason: "Opposite-direction contingency from a stopped-out automated plan.",
  });
  if (!qualified.ok) return;
  await applyEventAndPersist(supabase, userId, seeded.planId, {
    type: "await_confirmation",
    at,
    reason: "Entry trigger priced; watching for the required break/retest/confirmation-move sequence before it can arm.",
  });
}
