/**
 * Server-only aggregation of a profile's real Novice (paper) trading history
 * into `PromotionReadinessInputs` (see `lib/promotion/eligibility.ts`).
 *
 * Every metric here is computed from `public.positions` (mode = 'paper') and
 * `public.promotion_progress` — never from live trading, matching the
 * Novice risk/cooldown engine's own posture (lib/risk/service.ts) that its
 * rules, and by extension anything derived the same way, must not reach
 * across the paper/live boundary. GSPS has no live-order history yet
 * (ROADMAP.md), and Pro/Novice is a paper-trading behavioral ladder, not a
 * live-account one.
 *
 * Two of these metrics are necessarily approximations, flagged inline:
 * there is no per-fill "did the user honor their plan" record, and there is
 * no historical paper-equity curve (unlike `risk_live_equity_snapshots`,
 * which only exists for live accounts). Both proxies are conservative and
 * documented rather than silently precise-looking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeExecutionScore } from "@/lib/risk/execution-score";
import { MAX_SINGLE_POSITION_ALLOCATION_PCT } from "@/lib/risk/config";
import { STARTING_CASH } from "@/lib/brokers/simulator";
import type { PromotionPolicy } from "@/lib/promotion/config";
import type { PromotionReadinessInputs } from "@/lib/promotion/eligibility";

interface ClosedPositionRow {
  qty: number;
  avg_entry_price: number;
  stop_loss: number | null;
  realized_pl: number | null;
  opened_at: string;
  closed_at: string | null;
}

interface ProgressRow {
  education_completed_at: string | null;
  practice_validation_completed_at: string | null;
}

/** Days between `from` and `now`, floored — a partial day of use doesn't round up to a full one. */
function daysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Gathers real readiness inputs for one profile. `supabase` should be a
 * service-role client — this reads across tables beyond what a user's own
 * RLS-scoped session needs to see (the policy-facing shape, not raw rows).
 */
export async function gatherPromotionReadinessInputs(
  supabase: SupabaseClient,
  profileId: string,
  policy: PromotionPolicy,
  now: Date = new Date(),
): Promise<PromotionReadinessInputs> {
  const [{ data: profile }, { data: closedRaw, error: closedError }, { data: progressRaw }] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", profileId).single(),
    supabase
      .from("positions")
      .select("qty, avg_entry_price, stop_loss, realized_pl, opened_at, closed_at")
      .eq("user_id", profileId)
      .eq("mode", "paper")
      .eq("closed", true),
    supabase
      .from("promotion_progress")
      .select("education_completed_at, practice_validation_completed_at")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);

  if (closedError) {
    console.error(`promotion: closed-position read failed for ${profileId} — ${closedError.message}`);
  }

  const closed = (closedRaw ?? []) as ClosedPositionRow[];
  const progress = progressRaw as ProgressRow | null;

  const accountAgeDays = profile?.created_at ? daysSince(new Date(profile.created_at as string), now) : 0;

  const lookbackCutoff = new Date(now.getTime() - policy.riskStateLookbackDays * 86_400_000);
  const recentClosed = closed.filter((p) => p.closed_at && new Date(p.closed_at) >= lookbackCutoff);

  // Stop adherence: fraction of recently closed trades that carried a stop
  // at open. This is a proxy for "the plan had a stop and it governed the
  // exit" — GSPS does not yet record whether an exit was the stop firing
  // versus a manual close that happened to occur near it, so a trade with
  // no stop at all is the one case this can assert with confidence.
  const stopAdherenceRatio = ratio(recentClosed, (p) => p.stop_loss != null);

  // Position-size compliance: fraction of recently closed trades whose
  // entry notional stayed within the existing single-position allocation
  // ceiling (lib/risk/config.ts), against the fixed paper starting balance
  // rather than a historical equity curve GSPS does not record for paper
  // accounts.
  const positionSizeComplianceRatio = ratio(
    recentClosed,
    (p) => (p.qty * p.avg_entry_price) / STARTING_CASH <= MAX_SINGLE_POSITION_ALLOCATION_PCT / 100,
  );

  // Severe-risk-event proxy: realized losses in the lookback window, as a
  // percent of the paper starting balance, breaching the policy's severe
  // threshold. A true high-water-mark drawdown (lib/risk/metrics.ts) needs
  // an equity-sample history that paper accounts don't have; this is the
  // conservative substitute available from closed-trade P&L alone.
  const realizedLossPct = Math.max(
    0,
    -recentClosed.reduce((sum, p) => sum + (p.realized_pl ?? 0), 0) / STARTING_CASH,
  ) * 100;
  const hadSevereRiskEventRecently = realizedLossPct >= policy.severeDrawdownPct;

  const executionScore = computeExecutionScore({
    stopDiscipline: stopAdherenceRatio,
    positionSizing: positionSizeComplianceRatio,
    // No dedicated tracking yet for these four — see module doc above.
    // Scored at full credit rather than zero so the process score reflects
    // only the two metrics GSPS can actually measure today; the two
    // explicit adherence requirements are still enforced independently in
    // lib/promotion/eligibility.ts regardless of this score.
    entryDiscipline: 1,
    exitPlanAdherence: 1,
    frequencyDiscipline: 1,
    correlationDiscipline: 1,
    journalCompletion: 1,
  }).score;

  return {
    completedTrades: closed.length,
    accountAgeDays,
    executionScore,
    stopAdherenceRatio,
    positionSizeComplianceRatio,
    hadSevereRiskEventRecently,
    educationCompleted: progress?.education_completed_at != null,
    practiceValidationCompleted: progress?.practice_validation_completed_at != null,
  };
}

function ratio<T>(rows: T[], predicate: (row: T) => boolean): number {
  if (rows.length === 0) return 1; // nothing to fail yet — see requirement gating in eligibility.ts, which still requires minCompletedTrades separately.
  return rows.filter(predicate).length / rows.length;
}
