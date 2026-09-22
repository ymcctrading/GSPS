/**
 * The Automated Portfolio Manager — the fully-autonomous, non-plan-scoped
 * engine behind `components/automation/control-panel.tsx`'s "Automated
 * Portfolio Manager" toggle (`user_automation_profiles`, System Mastery
 * only). Distinct from the plan-scoped GSPS Automation a member activates
 * by hand (`lib/automation/service.ts`, `automation_profiles`) — this is
 * the other one, the one the control panel's copy already claimed was
 * "running hands-free."
 *
 * Before this module existed, flipping that toggle only ever wrote a row
 * nothing read back except the same toggle's own initial state — no scan,
 * cron, or worker consumed `is_automation_enabled`, `risk_profile`,
 * `directional_bias`, or `volatility_trigger_value` to act on anything.
 * The UI told users an engine was managing their entries, stops, and exits
 * while no such engine existed. This module is that engine.
 *
 * Design choice: rather than duplicate `lib/automation/service.ts`'s
 * eligibility gates, order-term derivation, and audit trail, this scans for
 * plans matching a profile's dials and then activates them through
 * `activateAutomationProfile` — the exact path a member's own deliberate
 * click on `/automation` takes. Every safety rail that applies there
 * (entry-confirmation gate, Wall Street entitlement, order-term resolution
 * server-side only, `automation_events` audit trail) applies here for free,
 * and the two engines can never drift out of sync on what "eligible" means.
 *
 * The route to live is pre-established, not built-then-blocked: a member
 * can pick `execution_mode: "live"` on `user_automation_profiles`
 * (`components/automation/control-panel.tsx`) the same way they already
 * pick paper/live on the plan-scoped flow, and this loop honors it — but
 * only once `checkAutonomousLiveTradingAuthorized`
 * (`lib/automation/autonomous-live-gate.ts`) actually authorizes it, which
 * fails closed by default (dedicated kill switch defaults on, no sign-off
 * exists yet). Until a live broker connection and that authorization both
 * exist, a member who picks "live" here simply has their candidates skipped
 * each run with a clear reason, rather than the loop silently trading paper
 * on their behalf instead. See docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { getOrCreateAccount } from "@/lib/brokers/simulator";
import { readLiveAccountValue } from "@/lib/risk/live-account";
import { activateAutomationProfile } from "@/lib/automation/service";
import {
  checkAutonomousLiveTradingAuthorized,
  AUTONOMOUS_LIVE_MAX_DOLLAR_RISK_PER_TRADE,
  AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK,
} from "@/lib/automation/autonomous-live-gate";
import { MAX_NEW_POSITIONS_PER_DAY } from "@/lib/risk/config";
import { etDateKey } from "@/lib/market/session";
import type { RulesAlignmentTier } from "@/lib/signals/types";

type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";
type DirectionalBias = "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH";
type TriggerType = "PERCENTAGE" | "DOLLAR_AMOUNT";

interface AutonomousProfileRow {
  user_id: string;
  is_automation_enabled: boolean;
  risk_profile: RiskProfile;
  directional_bias: DirectionalBias;
  volatility_trigger_type: TriggerType;
  volatility_trigger_value: number;
  execution_mode: "paper" | "live";
}

interface CandidatePlanRow {
  plan_id: string;
  instrument: string;
  direction: "bullish" | "bearish";
  market: string;
  entry_trigger: number;
  invalidation: number;
  /** Signal & Regime Engine rollup recorded at plan-creation time (see
   * lib/lifecycle/fromScanResult.ts). trade_plans carries no Gann 0-9 score
   * column of its own -- every plan here already cleared the Gann Execute
   * gate before a trade_plan was ever created (buildNewTradePlanFromScanResult
   * runs only on a confirmed WATCH -> EXECUTE transition), so this tier is
   * the one ranking signal actually available to pick the best of several
   * armed candidates from. */
  alignment: { tier: RulesAlignmentTier } | null;
}

/** Same ordinal lib/signals/publicSummary.ts#toPublicSignalSummary uses to
 * pick the strongest verdict across states -- kept in the same order here so
 * "best" means the same thing on every surface that ranks by tier. */
const TIER_RANK: Record<RulesAlignmentTier, number> = {
  watchlistOnly: 0,
  qualified: 1,
  aTier: 2,
  aPlusTier: 3,
};

function tierRank(alignment: { tier: RulesAlignmentTier } | null): number {
  return alignment ? TIER_RANK[alignment.tier] : -1;
}

/** Fraction of paper equity risked per trade, by dial position. */
const RISK_PCT: Record<RiskProfile, number> = {
  PASSIVE: 0.005,
  MODERATE: 0.01,
  AGGRESSIVE: 0.02,
};

/** Below this, a sized position would round to zero shares on most tickers — not worth activating. */
const MIN_ALLOCATED_DOLLAR_RISK = 25;

export interface PortfolioManagerRunResult {
  profilesEnabled: number;
  plansActivated: number;
  plansSkipped: number;
  errors: { userId: string; planId?: string; reason: string }[];
}

/**
 * One pass of the autonomous loop: for every member with the Portfolio
 * Manager switched on, find their armed, entry-confirmed, not-yet-automated
 * plans matching that member's directional bias and volatility trigger, and
 * activate paper automation against each one via the same path a manual
 * click on `/automation` uses.
 *
 * Safe to call on a schedule from a stateless invocation — every check
 * (entitlement, eligibility, dedupe against existing `automation_profiles`
 * rows) is re-derived from the database on each run rather than cached, so
 * a run that finds nothing new to do is a correct, cheap no-op.
 */
export async function runAutonomousPortfolioManager(
  supabase: SupabaseClient,
): Promise<PortfolioManagerRunResult> {
  const result: PortfolioManagerRunResult = {
    profilesEnabled: 0,
    plansActivated: 0,
    plansSkipped: 0,
    errors: [],
  };

  const { data: profiles, error: profilesError } = await supabase
    .from("user_automation_profiles")
    .select(
      "user_id, is_automation_enabled, risk_profile, directional_bias, volatility_trigger_type, volatility_trigger_value, execution_mode",
    )
    .eq("is_automation_enabled", true);
  if (profilesError) {
    result.errors.push({ userId: "*", reason: `Could not load automation profiles: ${profilesError.message}` });
    return result;
  }

  const enabled = (profiles ?? []) as AutonomousProfileRow[];
  result.profilesEnabled = enabled.length;

  for (const profile of enabled) {
    try {
      await runForProfile(supabase, profile, result);
    } catch (err) {
      result.errors.push({
        userId: profile.user_id,
        reason: err instanceof Error ? err.message : "Unknown error evaluating profile.",
      });
    }
  }

  return result;
}

async function runForProfile(
  supabase: SupabaseClient,
  profile: AutonomousProfileRow,
  result: PortfolioManagerRunResult,
): Promise<void> {
  // Re-verify server-side on every run rather than trusting the stored row —
  // a downgraded subscription must stop this loop from acting on the very
  // next pass, not just block new toggles from the UI.
  const policy = await getUserEntitlementPolicy(supabase, profile.user_id);
  if (!policy.automationEnabled) return;

  const { data: openProfiles } = await supabase
    .from("automation_profiles")
    .select("plan_id")
    .eq("user_id", profile.user_id)
    .in("status", ["active", "paused"]);
  const alreadyAutomated = new Set((openProfiles ?? []).map((r) => r.plan_id as string));

  const { data: plans, error: plansError } = await supabase
    .from("trade_plans")
    .select("plan_id, instrument, direction, market, entry_trigger, invalidation, alignment")
    .eq("user_id", profile.user_id)
    .eq("market", "us_equity")
    .eq("state", "armed");
  if (plansError) {
    result.errors.push({ userId: profile.user_id, reason: `Could not load plans: ${plansError.message}` });
    return;
  }

  // Best tier first, so a capacity-limited run (the daily cap below, or a
  // partial activation failure) spends its slots on the strongest candidates
  // rather than whichever happened to sort first out of Postgres. Ties (same
  // tier) keep the query's own order, which is insertion order -- the older,
  // longer-armed plan first.
  const candidates = ((plans ?? []) as CandidatePlanRow[])
    .filter((plan) => !alreadyAutomated.has(plan.plan_id))
    .sort((a, b) => tierRank(b.alignment) - tierRank(a.alignment));

  // A member's choice of "live" only ever becomes a live order once the
  // dedicated kill switch is off AND a sign-off is on record
  // (checkAutonomousLiveTradingAuthorized, lib/automation/
  // autonomous-live-gate.ts) — see
  // docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md. Absent that, the loop
  // does not silently substitute paper for a member who asked for live: it
  // skips their candidates for this run and says why, so "no active
  // deployments" reads as "not authorized yet," not as an unexplained no-op.
  let executionMode: "paper" | "live" = "paper";
  let liveDollarRiskSpentToday = 0;
  if (profile.execution_mode === "live") {
    const authorization = await checkAutonomousLiveTradingAuthorized(supabase);
    if (!authorization.authorized) {
      result.plansSkipped += candidates.length;
      if (candidates.length > 0) {
        result.errors.push({
          userId: profile.user_id,
          reason: `Live execution requested but not yet authorized: ${authorization.reason}`,
        });
      }
      return;
    }
    executionMode = "live";
    liveDollarRiskSpentToday = await sumLiveDollarRiskActivatedSince(
      supabase,
      profile.user_id,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
  }

  // Sizing has to read the account this loop is actually about to trade
  // against — a live activation sized off the $100k paper balance instead
  // of the member's real, possibly much smaller (or larger) live equity
  // would either wildly over- or under-risk the account. Fails closed: an
  // authorized "live" profile with no readable live equity skips this run
  // rather than falling back to the paper balance as a stand-in.
  let equityBasis: number;
  if (executionMode === "live") {
    const live = await readLiveAccountValue(supabase, profile.user_id);
    if (!live.verified) {
      result.plansSkipped += candidates.length;
      if (candidates.length > 0) {
        result.errors.push({
          userId: profile.user_id,
          reason: "Live execution authorized but no verified live account equity to size against — skipping this run.",
        });
      }
      return;
    }
    equityBasis = live.equity;
  } else {
    equityBasis = (await getOrCreateAccount(supabase, profile.user_id)).cash;
  }

  const allocatedDollarRisk = Math.max(
    MIN_ALLOCATED_DOLLAR_RISK,
    Math.round(equityBasis * RISK_PCT[profile.risk_profile]),
  );

  // "Take the top three setups" — MAX_NEW_POSITIONS_PER_DAY (lib/risk/config.ts,
  // = 3) is the platform's existing per-day new-position ceiling, enforced for
  // live trading by the Novice Risk & Cooldown Engine's circuit breaker
  // (lib/risk/circuit-breaker.ts) — but that engine only ever gates real money
  // (see lib/risk/service.ts's own header), so nothing capped this loop's
  // paper activations, which is the mode it runs in almost exclusively today.
  // Re-derived from automation_profiles on every run rather than tracked in
  // memory, same reasoning as everything else here: a run that already spent
  // the day's budget on an earlier pass must see that, not just this pass's
  // own activations.
  const activatedToday = await countActivatedToday(supabase, profile.user_id);
  let remainingToday = Math.max(0, MAX_NEW_POSITIONS_PER_DAY - activatedToday);
  if (remainingToday === 0 && candidates.length > 0) {
    result.plansSkipped += candidates.length;
    result.errors.push({
      userId: profile.user_id,
      reason: `Skipped ${candidates.length} candidate(s) — already activated ${activatedToday} new position(s) today (cap ${MAX_NEW_POSITIONS_PER_DAY}).`,
    });
    return;
  }

  for (const plan of candidates) {
    if (remainingToday <= 0) {
      result.plansSkipped++;
      continue;
    }
    if (!matchesDirectionalBias(plan.direction, profile.directional_bias)) {
      result.plansSkipped++;
      continue;
    }
    if (!matchesVolatilityTrigger(plan, profile.volatility_trigger_type, profile.volatility_trigger_value)) {
      result.plansSkipped++;
      continue;
    }

    let tradeDollarRisk = allocatedDollarRisk;
    if (executionMode === "live") {
      tradeDollarRisk = Math.min(tradeDollarRisk, AUTONOMOUS_LIVE_MAX_DOLLAR_RISK_PER_TRADE);
      if (liveDollarRiskSpentToday + tradeDollarRisk > AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK) {
        result.plansSkipped++;
        result.errors.push({
          userId: profile.user_id,
          planId: plan.plan_id,
          reason: `Skipped — would exceed the $${AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK} autonomous live daily risk cap.`,
        });
        continue;
      }
    }

    const activation = await activateAutomationProfile(supabase, profile.user_id, {
      planId: plan.plan_id,
      automationMode: "system_plan",
      executionMode,
      configuration: { allocatedDollarRisk: tradeDollarRisk },
    });
    if (activation.ok) {
      result.plansActivated++;
      remainingToday--;
      if (executionMode === "live") liveDollarRiskSpentToday += tradeDollarRisk;
    } else {
      result.plansSkipped++;
      result.errors.push({
        userId: profile.user_id,
        planId: plan.plan_id,
        reason: activation.error ?? "Activation failed for an unknown reason.",
      });
    }
  }
}

/**
 * Sums `allocatedDollarRisk` across this member's autonomous-loop live
 * activations (`automation_mode = 'system_plan'`, `execution_mode = 'live'`)
 * created since `since`, to enforce `AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK`
 * as a real rolling window rather than a per-run counter that forgets
 * everything between invocations. Deliberately does not include the
 * plan-scoped flow's member-clicked live activations — those are a
 * separately reviewed, separately capped risk (`MAX_ALLOCATED_DOLLAR_RISK`
 * in `lib/automation/service.ts`), not this loop's budget to spend.
 */
/**
 * Counts this member's autonomous-loop activations (any execution mode --
 * paper counts against the same daily headline as live) whose `activated_at`
 * falls on today's US/Eastern trading date. Bounded to the last two days by
 * `created_at` before the precise ET-day filter, same pattern
 * lib/promotion/novice-home.ts uses for "positions opened today" -- cheap to
 * fetch, exact to filter, no server-side timezone arithmetic to get wrong.
 */
async function countActivatedToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("automation_profiles")
    .select("activated_at")
    .eq("user_id", userId)
    .eq("automation_mode", "system_plan")
    .gte("created_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
  if (error) {
    console.error(`countActivatedToday: query failed for ${userId} — ${error.message}`);
    // Fails closed: an unreadable activation history reads as the day's cap
    // already spent, never as room to activate more.
    return MAX_NEW_POSITIONS_PER_DAY;
  }
  const today = etDateKey(new Date());
  return ((data ?? []) as { activated_at: string }[]).filter(
    (row) => etDateKey(new Date(row.activated_at)) === today,
  ).length;
}

async function sumLiveDollarRiskActivatedSince(
  supabase: SupabaseClient,
  userId: string,
  since: Date,
): Promise<number> {
  const { data, error } = await supabase
    .from("automation_profiles")
    .select("configuration")
    .eq("user_id", userId)
    .eq("automation_mode", "system_plan")
    .eq("execution_mode", "live")
    .gte("created_at", since.toISOString());
  if (error) {
    console.error(`sumLiveDollarRiskActivatedSince: query failed for ${userId} — ${error.message}`);
    // Fails closed: an unreadable spend history is treated as "budget
    // already spent," never as room to spend more.
    return AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK;
  }
  return ((data ?? []) as { configuration: { allocatedDollarRisk: number } }[]).reduce(
    (sum, row) => sum + Number(row.configuration.allocatedDollarRisk ?? 0),
    0,
  );
}

export function matchesDirectionalBias(direction: "bullish" | "bearish", bias: DirectionalBias): boolean {
  if (bias === "BOTH") return true;
  if (bias === "BULLISH_ONLY") return direction === "bullish";
  return direction === "bearish";
}

/**
 * The dial reads "only deploy when a move exceeds this threshold." There is
 * no live intraday tick feed in this batch loop to measure the underlying's
 * realized move against, so the proxy is the plan's own priced risk — the
 * entry-to-stop distance, which is exactly the size of move the setup is
 * built to withstand. A tighter (smaller) trigger value takes more setups;
 * a wider one restricts to setups already carrying a larger built-in move.
 */
export function matchesVolatilityTrigger(
  plan: Pick<CandidatePlanRow, "entry_trigger" | "invalidation">,
  triggerType: TriggerType,
  triggerValue: number,
): boolean {
  const dollarMove = Math.abs(plan.entry_trigger - plan.invalidation);
  if (triggerType === "DOLLAR_AMOUNT") return dollarMove >= triggerValue;
  if (plan.entry_trigger <= 0) return false;
  const pctMove = (dollarMove / plan.entry_trigger) * 100;
  return pctMove >= triggerValue;
}
