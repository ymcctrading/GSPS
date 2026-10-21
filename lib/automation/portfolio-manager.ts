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
import { getOrCreateAccount, STARTING_CASH } from "@/lib/brokers/simulator";
import { gannRiskCapital, readWinningRun } from "@/lib/risk/dynamic-risk";
import { readLiveAccountValue } from "@/lib/risk/live-account";
import { activateAutomationProfile, authorizeAutomatedOrder } from "@/lib/automation/service";
import {
  checkAutonomousLiveTradingAuthorized,
  AUTONOMOUS_PROVING_PERIOD,
  AUTONOMOUS_LIVE_MAX_DOLLAR_RISK_PER_TRADE,
  AUTONOMOUS_LIVE_MAX_DAILY_DOLLAR_RISK,
} from "@/lib/automation/autonomous-live-gate";
import { armConfirmedPlansFromBars, planStopBroken } from "@/lib/lifecycle/armFromBars";
import type { RulesAlignmentTier } from "@/lib/signals/types";
import { roundNumberEntryBlocked } from "@/lib/gann/evenFigures";
import { gannCrossedLevel } from "@/lib/gann/entryTrigger";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { levelBeforeThreePoints } from "@/lib/gann/pointScale";
import { isPivotSignal } from "@/lib/lifecycle/fromPivot";
import { awayReminderDue, resolveGannRulePrefs } from "@/lib/gann/traderPrefs";
import { maxRiskForTrade } from "@/lib/risk/gannCapital";
import { readProfitCeiling } from "@/lib/risk/profitPeak";

export type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";
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
  /** `pivot:`-prefixed for a stop-and-reverse plan (`lib/lifecycle/fromPivot.ts`). */
  signal_id: string | null;
  /** Migration 0086; null for a crossing. */
  entry_kind?: string | null;
  instrument: string;
  direction: "bullish" | "bearish";
  market: string;
  entry_trigger: number;
  invalidation: number;
  generated_at: string;
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

/**
 * The dollars one activation may risk: the dial's percent of the trading
 * capital, raised to the minimum allocation, and never more than a tenth of
 * that capital (never-failing rule 1, W006 p.46; Commodities pp.29-30,
 * `lib/risk/gannCapital.ts`). The tenth is applied last, so the minimum can't
 * lift a small account past it. Placement checks the same tenth again
 * (`lib/trade/place-order.ts`).
 */
export function allocatedDollarRiskFor(capital: number, riskProfile: RiskProfile, profitCeiling: number | null = null): number {
  const dial = Math.max(MIN_ALLOCATED_DOLLAR_RISK, Math.round(capital * RISK_PCT[riskProfile]));
  return Math.min(dial, maxRiskForTrade(capital, profitCeiling));
}

export interface PortfolioManagerRunResult {
  profilesEnabled: number;
  plansActivated: number;
  plansSkipped: number;
  /** Activated plans whose resting entry was placed on a later pass. */
  restingOrdersPlaced: number;
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
    restingOrdersPlaced: 0,
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
    .select("profile_id, plan_id, status")
    .eq("user_id", profile.user_id)
    .in("status", ["active", "paused"]);
  const openRows = (openProfiles ?? []) as { profile_id: string; plan_id: string; status: string }[];
  const alreadyAutomated = new Set(openRows.map((r) => r.plan_id));

  // Arm whatever has confirmed on the closed bars since it was generated,
  // before reading the armed plans (lib/lifecycle/armFromBars.ts).
  const arming = await armConfirmedPlansFromBars(supabase, profile.user_id, { market: "us_equity" });
  for (const e of arming.errors) result.errors.push({ userId: profile.user_id, planId: e.planId, reason: `Arming: ${e.reason}` });

  const { data: plans, error: plansError } = await supabase
    .from("trade_plans")
    // Every column, so `entry_kind` (migration 0086) is read where it exists
    // without failing the query where it doesn't yet.
    .select("*")
    .eq("user_id", profile.user_id)
    .eq("market", "us_equity")
    .eq("state", "armed");
  if (plansError) {
    result.errors.push({ userId: profile.user_id, reason: `Could not load plans: ${plansError.message}` });
    return;
  }

  // An activated plan whose entry was still waiting when it was activated
  // (an old level resting for its second test, a crossing waiting for the
  // reaction) is placed on the pass that finds it confirmed. Activation tries
  // once; without this the plan sat "automated" with no order until it expired.
  await placeRestingEntries(supabase, profile.user_id, openRows, (plans ?? []) as CandidatePlanRow[], result);

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
  // During the proving period every profile runs on paper (AUTONOMOUS_PROVING_PERIOD).
  if (profile.execution_mode === "live" && !AUTONOMOUS_PROVING_PERIOD) {
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
  // Gann's trading unit (A-RISK-04, rule 24; owner, 2026-10-16, Q7): the
  // paper account steps up only once profits equal its starting capital, and
  // neither account steps up on a long run of wins. No starting capital is on
  // record for a live account, so only the rule-24 hold applies there.
  const run = await readWinningRun(supabase, profile.user_id);
  // A-RISK-07: after large profits, a tenth of the profits at most, still
  // after a loss, read on the equity before the unit (lib/risk/profitPeak.ts).
  const profitCeiling = await readProfitCeiling(supabase, profile.user_id, executionMode === "live" ? "live" : "paper", equityBasis);
  equityBasis = run
    ? gannRiskCapital({ equity: equityBasis, startingCapital: executionMode === "live" ? 0 : STARTING_CASH, ...run }).capital
    : Math.min(equityBasis, executionMode === "live" ? equityBasis : STARTING_CASH);

  const allocatedDollarRisk = allocatedDollarRiskFor(equityBasis, profile.risk_profile, profitCeiling);
  if (!(allocatedDollarRisk > 0)) {
    result.plansSkipped += candidates.length;
    if (candidates.length > 0) {
      result.errors.push({ userId: profile.user_id, reason: "No trading capital to size against — skipping this run." });
    }
    return;
  }

  // No daily count of new positions (Q8, Gann sets none; owner 2026-10-21,
  // "What would Gann do"). Until then this loop stopped at three a day
  // (MAX_NEW_POSITIONS_PER_DAY). Gann's capital rules bound it instead, at
  // placement: at most five stocks, 30 points of capital a share and a tenth
  // of the capital at risk (lib/risk/gannCapital.ts). Candidates still go
  // best tier first, so the strongest take the room.

  // Gann's even figures (owner, 2026-09-28): with auto-ordering at round
  // numbers off (the default), an entry just short of a round number is not
  // placed unless the plan's own breakout level is that number. See
  // lib/gann/evenFigures.ts#roundNumberEntryBlocked.
  const { data: settingsRow } = await supabase.from("settings").select("prefs").eq("user_id", profile.user_id).maybeSingle();
  const gannPrefs = resolveGannRulePrefs((settingsRow as { prefs?: unknown } | null)?.prefs ?? null);
  // A-EXIT-05 (W022 p.113): Gann goes flat before he is away from the market,
  // so inside the trader's away window nothing new is opened for them. Open
  // positions keep their exits.
  if (candidates.length > 0 && awayReminderDue(gannPrefs)) {
    result.plansSkipped += candidates.length;
    result.errors.push({
      userId: profile.user_id,
      reason: `Skipped ${candidates.length} candidate(s): the trader will be away from ${gannPrefs.awayFrom}, so no new position is opened.`,
    });
    return;
  }

  for (const plan of candidates) {
    if (!matchesDirectionalBias(plan.direction, profile.directional_bias)) {
      result.plansSkipped++;
      continue;
    }
    if (!matchesVolatilityTrigger(plan, profile.volatility_trigger_type, profile.volatility_trigger_value)) {
      result.plansSkipped++;
      continue;
    }
    // A plan whose stop has broken is retired, not a candidate (lib/lifecycle/armFromBars.ts#stopBrokenSince).
    const broken = await planStopBroken({
      instrument: plan.instrument,
      market: plan.market,
      direction: plan.direction,
      invalidation: Number(plan.invalidation),
      generatedAt: plan.generated_at,
    }).catch(() => null);
    if (broken !== false) {
      result.plansSkipped++;
      result.errors.push({
        userId: profile.user_id,
        planId: plan.plan_id,
        reason: broken ? "Stop already broken; the plan is retired." : "Couldn't read bars to check the stop; skipped this run.",
      });
      continue;
    }
    if (!gannPrefs.autoOrderRoundNumbers) {
      // The plan's entry is Gann's reaction buy, the crossed level plus 1
      // point, with its stop 3 points the other side (PLAN.md item 4); the
      // level is recovered from the two. A stop-and-reverse plan's entry and
      // stop are not that pair, so its level is read back from the entry alone.
      const entry = Number(plan.entry_trigger);
      // An old-level plan (a double or triple bottom) rests at the level
      // itself, and a held bottom's at the last close: neither crossed one.
      const crossedLevel = isPivotSignal(plan.signal_id)
        ? levelBeforeThreePoints(entry, plan.direction)
        : restsWithoutCrossing(plan.entry_kind)
          ? entry
          : gannCrossedLevel(entry, Number(plan.invalidation));
      const rn = roundNumberEntryBlocked({ entry, direction: plan.direction, crossedLevel });
      if (rn.blocked) {
        result.plansSkipped++;
        result.errors.push({ userId: profile.user_id, planId: plan.plan_id, reason: rn.note ?? "Held at a round number." });
        continue;
      }
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
 * Retries the placement of every active activation whose plan is still armed
 * and that has never had an order submitted. Placement re-reads the closed
 * bars (`lib/trade/place-order.ts`), so an entry still waiting is refused and
 * logged once, and one whose reaction has come goes at the market. "Never had
 * an order" is read from the activation's own audit trail, not `orders`, whose
 * closed rows are pruned: a trade that already ran and closed is never
 * re-entered from the same activation. The away window (A-EXIT-05) holds these
 * too, as it holds new activations.
 */
async function placeRestingEntries(
  supabase: SupabaseClient,
  userId: string,
  openRows: { profile_id: string; plan_id: string; status: string }[],
  armedPlans: CandidatePlanRow[],
  result: PortfolioManagerRunResult,
): Promise<void> {
  const armedIds = new Set(armedPlans.map((p) => p.plan_id));
  const waiting = openRows.filter((r) => r.status === "active" && armedIds.has(r.plan_id));
  if (waiting.length === 0) return;

  const { data: submitted, error } = await supabase
    .from("automation_events")
    .select("profile_id")
    .eq("user_id", userId)
    .eq("kind", "broker_order_submitted")
    .in(
      "profile_id",
      waiting.map((r) => r.profile_id),
    );
  if (error) {
    // Fails closed: an unreadable trail could hide an order already placed.
    result.errors.push({ userId, reason: `Could not read automation history: ${error.message}` });
    return;
  }
  const placed = new Set(((submitted ?? []) as { profile_id: string }[]).map((r) => r.profile_id));

  const { data: settingsRow } = await supabase.from("settings").select("prefs").eq("user_id", userId).maybeSingle();
  if (awayReminderDue(resolveGannRulePrefs((settingsRow as { prefs?: unknown } | null)?.prefs ?? null))) return;

  for (const row of waiting) {
    if (placed.has(row.profile_id)) continue;
    const outcome = await authorizeAutomatedOrder(supabase, userId, row.profile_id, { retry: true });
    if (outcome.authorized) result.restingOrdersPlaced++;
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
