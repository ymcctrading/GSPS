/**
 * The gate between the Automated Portfolio Manager loop and live order
 * submission. Every check here has to pass before this codebase will ever
 * let the autonomous (non-human-clicked) loop request `executionMode:
 * "live"` instead of `"paper"` — see docs/
 * AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md for why this loop is a
 * materially different risk than the existing plan-scoped flow's live mode,
 * where a member deliberately opts into one specific, already-priced plan
 * by hand.
 *
 * Distinct from the plan-scoped GSPS Automation's live path
 * (`lib/automation/service.ts`, already shipped and human-click-gated) and
 * from the global `TRADING_DISABLED` kill switch (`lib/trade/kill-switch.ts`,
 * which halts every order path at once) — this is the narrower, additional
 * gate specific to entries this loop places with no per-trade human in the
 * loop.
 *
 * There is currently no caller anywhere in this codebase that requests live
 * execution from the autonomous loop, and no UI affordance to enable it —
 * `lib/automation/portfolio-manager.ts` hardcodes `"paper"`. This module
 * exists so that whenever that changes, it can only ever change behind a
 * real, recorded compliance sign-off — never behind a code change alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureAuthorized } from "@/lib/compliance/signoff";

/**
 * The proving period (owner, 2026-10-16: "remove the live broker connection,
 * environment kill switch (enable), remove human compliance sign-off (it will
 * go back on AFTER we have proven that the portfolio manager actually
 * works)").
 *
 * While true, the Automated Portfolio Manager runs every enabled profile on
 * paper, whatever execution mode the member picked, so it needs no live
 * broker connection, and neither the compliance sign-off nor
 * AUTONOMOUS_LIVE_TRADING_HALTED is consulted. No order the loop places can
 * reach a real broker account while this is true.
 *
 * To put the sign-off back once the manager has proven itself, set this to
 * false. That restores the live path exactly as it was: a member who picks
 * "live" trades live only with a verified live broker account, the kill
 * switch off, and an active `autonomous_live_trading` sign-off.
 */
export const AUTONOMOUS_PROVING_PERIOD = true;

/**
 * A second, narrower env-var kill switch, checked in addition to (never
 * instead of) `TRADING_DISABLED`. Reason for a dedicated flag: an incident
 * specific to the autonomous loop (a sizing bug, a runaway activation loop)
 * should be stoppable without halting every other order path in the app —
 * manual tickets, Guided Decision Mode, and human-clicked plan automation
 * all keep working while only this loop is down. Same fail-safe direction
 * as `tradingDisabled()`: anything other than a case-insensitive "true"
 * leaves the loop's live path refused, so an unset variable can never
 * silently authorize it.
 */
export function autonomousLiveTradingHalted(): boolean {
  return (process.env.AUTONOMOUS_LIVE_TRADING_HALTED ?? "true").trim().toLowerCase() !== "false";
}

/**
 * Hard per-trade notional ceiling for a live order this loop places on its
 * own initiative — well below the plan-scoped flow's member-supplied
 * MAX_ALLOCATED_DOLLAR_RISK (lib/automation/service.ts, $50,000), because a
 * human never reviewed this specific trade before it went out. Not
 * configurable via env or database — raising it is a code change with its
 * own review, not an operational toggle.
 */
export const AUTONOMOUS_LIVE_MAX_DOLLAR_RISK_PER_TRADE = 500;

/** Aggregate cap across all of one member's autonomous live activations in a rolling 24h window. */
export const AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK = 1_500;

export interface AutonomousLiveAuthorization {
  authorized: boolean;
  reason?: string;
}

/**
 * The single call site every future live-activation attempt from the
 * autonomous loop must pass through. Fails closed on every branch: a
 * missing sign-off, an engaged kill switch, or a query error all resolve to
 * `authorized: false` — never the reverse.
 */
export async function checkAutonomousLiveTradingAuthorized(
  supabase: SupabaseClient,
): Promise<AutonomousLiveAuthorization> {
  if (autonomousLiveTradingHalted()) {
    return { authorized: false, reason: "AUTONOMOUS_LIVE_TRADING_HALTED is engaged (or unset — fail-safe default)." };
  }
  const signedOff = await isFeatureAuthorized(supabase, "autonomous_live_trading");
  if (!signedOff) {
    return {
      authorized: false,
      reason:
        "No active compliance sign-off recorded for \"autonomous_live_trading\" in compliance_signoffs. " +
        "See docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md.",
    };
  }
  return { authorized: true };
}
