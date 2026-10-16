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
 * 2. When the exit is one Gann reverses on (`lib/gann/reverse.ts`: a stop
 *    that was hit, a change of trend, a failed top, distribution), a fresh
 *    trade plan is seeded in the opposite direction at Gann's geometry: entry
 *    at the level that broke, stop 3 points beyond the old trade's extreme
 *    (A-EXIT-02, W006 p.48 Rule 6: "if stopped, reverse again"). Since
 *    2026-10-16 (owner's Q15, "reverse when caught: automatic where automation
 *    is on") this no longer waits on the account's `pivot_on_stop_out`
 *    setting: automation placed the trade, so automation reverses it. The
 *    column stays (no migration) and is no longer read. The new plan starts at
 *    WATCHLIST and still has to clear the entry confirmation every path
 *    requires (owner decision 4) before it can arm; the hold test and three
 *    adverse closes only take a trade off, they do not reverse it.
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
import { gannReversal, reversesOn, type ReversalCause } from "@/lib/gann/reverse";

export interface StopOutArgs {
  planId: string;
  /** The plan's own fill price at entry — automation never recorded one, so this backfills it from the plan's own entry trigger. */
  entryFillPrice: number;
  /** When the stop actually fired. */
  stoppedAt: string;
  exitPrice: number;
  /** Why the trade left. A plain stop when not given, the way the exit managers call on a stop-loss. */
  cause?: ReversalCause | null;
  /** The level whose break ended the trade, when known. */
  brokenLevel?: number | null;
  /** The best price the trade reached (the exit manager's high water), when known. */
  extreme?: number | null;
}

/**
 * The offer for a trade no automation placed: what Gann's rule says to do next,
 * for the exit manager's note. Null when this exit does not reverse.
 */
export function reversalOffer(input: {
  symbol: string;
  side: "long" | "short";
  cause: ReversalCause | null;
  brokenLevel: number;
  extreme: number;
}): string | null {
  if (!reversesOn(input.cause)) return null;
  const r = gannReversal({ side: input.side, brokenLevel: input.brokenLevel, extreme: input.extreme });
  if (!r) return null;
  const verb = r.side === "short" ? "sell short" : "buy";
  return `${input.symbol}: the rules reverse a trade that is caught. To follow them, ${verb} at ${r.entry.toFixed(2)} once the entry confirms, with a stop at ${r.stop.toFixed(2)}. Nothing was placed.`;
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
  if (!reversesOn(args.cause === undefined ? "stop" : args.cause)) return;

  await seedPivotTradePlan(supabase, userId, invalidated.plan, args);
}

async function seedPivotTradePlan(
  supabase: SupabaseClient,
  userId: string,
  stoppedPlan: TradePlan,
  args: StopOutArgs,
): Promise<void> {
  const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan, {
    generatedAt: args.stoppedAt,
    brokenLevel: args.brokenLevel ?? null,
    extreme: args.extreme ?? null,
  });
  if (!input) return;

  const { plan: seeded, created } = await createOrGetIdempotentTradePlan(supabase, userId, input);
  if (!created) return; // already seeded for this exact stop-out

  const at = new Date().toISOString();
  const marked = await applyEventAndPersist(supabase, userId, seeded.planId, {
    type: "mark_auto_created",
    at,
    reason: `Auto-created from ${stoppedPlan.instrument}'s Pivot Plan after its ${stoppedPlan.direction} counterpart was caught (reverse when caught).`,
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
