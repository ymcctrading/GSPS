/**
 * Track Record path — per-transition thresholds, one of GSPS's three
 * independent tier-promotion paths (see `transitions.ts` and AGENTS.md's
 * "Three-path tier promotion" section).
 *
 * Three-question mandate:
 * 1. Gann sourcing: N/A directly — a trading-competence evaluation window
 *    is a governance mechanism, not a market technique. Indirectly, the
 *    behavior being measured (stop adherence, position-size compliance) is
 *    behavior toward Gann-grounded trade plans, so the *quality* of what's
 *    measured is Gann-adjacent even though the measurement itself isn't.
 * 2. Dewey/cycle theory: a rolling evaluation window is a periodicity claim
 *    ("this window of behavior predicts future behavior"), so Dewey's
 *    seven-item checklist is run explicitly below, per transition.
 * 3. Hermetic principle: **Cause and Effect** (the track record IS the
 *    causal evidence a promotion is earned from) and **Rhythm** (the
 *    evaluation window is a recurring, rolling measurement per "Cycles as
 *    architecture" in AGENTS.md — a user who later drops below the bar can
 *    fall back out of it on the next read, this is not a one-time exam).
 *
 * ---
 *
 * ## Where these numbers come from — read this before changing any of them
 *
 * GSPS has no multi-year proprietary track record to derive these from yet.
 * `docs/replay-runs/`'s longest committed run spans roughly two months
 * (2026-07-27 through 2026-09-23). That is stated plainly rather than
 * papered over with false precision. Three real inputs were available and
 * used:
 *
 * 1. **The existing, already-shipped Novice→Pro policy**
 *    (`DEFAULT_PROMOTION_POLICY`, 2026-08-28 spec pack) as the anchor for
 *    "easy" — unchanged here, and explicitly NOT given a profitability
 *    requirement, consistent with the project owner's instruction that this
 *    transition stay comparatively easy to encourage early engagement.
 * 2. **GSPS's own measured backtest evidence**
 *    (`docs/replay-runs/2026-09-23-15Min-2R-within-all-12sym.json`): the
 *    Execute bucket — GSPS's own highest-conviction, Gann-selected setups —
 *    measured +0.362R expectancy, 36.6% win rate, profit factor 1.87 over
 *    41 trades. This is the one real, citable number this platform has for
 *    "what does trading GSPS's own best setups well look like," and it is
 *    used as the ceiling a Wall Street-track-record candidate must
 *    approach, not a number Pro→Expert candidates are expected to already
 *    match.
 * 3. **Structural precedent from publicly documented funded-account
 *    evaluation programs** (the well-known "prop firm evaluation" product
 *    category: a fixed minimum trading-day count, typically 10-30 days,
 *    plus a modest first-phase profit target, typically 8-10% of starting
 *    capital) — used only as an analogy for how long an evaluation window
 *    needs to be and how a profitability floor is commonly structured, not
 *    as evidence about GSPS's own setups or as a source of exact numbers.
 *
 * The resulting ladder is asymmetric by explicit design (project-owner
 * direction): comparatively easy at Novice→Pro (encourages early
 * engagement, no profitability bar at all), meaningfully harder at
 * Pro→Expert, and hardest at Expert→Wall Street (discourages skipping the
 * curriculum at the tier that unlocks autonomous live trading) — see
 * `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` and AGENTS.md's Strategy-Modes-
 * adjacent tier-gating precedent for the same asymmetric shape applied
 * elsewhere on this ladder.
 *
 * These are starting values, remotely tunable the same way
 * `DEFAULT_PROMOTION_POLICY` already is (`lib/promotion/policy.ts` overlays
 * `promotion_policy_values` rows on top of the code default) — re-derive
 * them once GSPS has its own multi-year track record rather than treating
 * them as permanent.
 *
 * ## Dewey's seven-item cycle-validation checklist, run against the
 * "rolling evaluation window predicts future behavior" claim
 *
 * - **Dominance**: not cleared — no evidence yet that trading-window
 *   performance is the *dominant* predictor of future performance, as
 *   opposed to one signal among several a novice human evaluator might also
 *   use.
 * - **Regularity of timing**: cleared by construction — each transition
 *   uses one fixed window length (`minAccountAgeDays`), applied
 *   identically to every profile.
 * - **Repetition count**: cleared by construction — `minCompletedTrades`
 *   exists specifically so the ratio-based metrics (stop adherence, size
 *   compliance, expectancy) aren't computed from a handful of trades that
 *   could be a fluke.
 * - **Constancy of period**: cleared by construction — the same window
 *   length is used for every profile within a transition, not
 *   individually tuned.
 * - **Phase-resumption after distortion**: cleared — `hadSevereRiskEventRecently`
 *   restarts the clock's meaning after a real risk event; a profile that
 *   blew through the drawdown ceiling doesn't stay "eligible" on stale
 *   history.
 * - **Wave-shape identity**: not applicable — this is one trader's
 *   behavior, not a repeating waveform to compare across occurrences.
 * - **Cross-series clustering**: not applicable — there is no second
 *   independent series to cluster against yet (this would require GSPS to
 *   have enough graduated users to compare cohorts, which it does not).
 *
 * Two of seven clear as genuine periodicity claims (regularity, phase-
 * resumption), three clear by construction rather than by evidence
 * (repetition count, constancy of period — these are policy choices, not
 * measured properties), and two do not apply to a single-trader evaluation
 * at all. Stated honestly rather than claiming a clean sweep.
 */

import { STARTING_CASH } from "@/lib/brokers/simulator";
import type { TierTransition } from "./transitions";

export interface TrackRecordPolicy {
  /** At least this many completed (paper) trades in the qualifying window. */
  minCompletedTrades: number;
  /** At least this many calendar days of documented GSPS use. */
  minAccountAgeDays: number;
  /** Rolling 30-day Execution Score (0-100) floor — behavior, never P&L (see lib/risk/execution-score.ts). */
  minExecutionScore: number;
  /** Stop-adherence ratio floor, 0-1. */
  minStopAdherenceRatio: number;
  /** Position-size-compliance ratio floor, 0-1. */
  minPositionSizeComplianceRatio: number;
  /** No cooldown/lock at or above this circuit-breaker severity in the prior N days. */
  riskStateLookbackDays: number;
  /** Trailing-window severe-drawdown ceiling, percent magnitude of the paper starting balance. */
  severeDrawdownPct: number;
  /**
   * Cumulative realized P&L over the qualifying window, as a percent of the
   * paper starting balance (`STARTING_CASH`). `0` means no profitability
   * requirement at all — deliberately the case for `novice_to_pro`, kept
   * separate from `lib/risk/execution-score.ts`'s behavior-only score by
   * design (see that module's own header comment on why P&L must never
   * feed execution scoring) — this is a distinct metric, computed only for
   * the promotion-eligibility question, never fed back into risk sizing.
   */
  minCumulativeReturnPct: number;
  /**
   * Average realized R-multiple across qualifying closed trades (realized
   * P&L ÷ planned dollar risk at entry). `0` means no requirement.
   */
  minExpectancyR: number;
}

export const DEFAULT_TRACK_RECORD_POLICIES: Record<TierTransition, TrackRecordPolicy> = {
  novice_to_pro: {
    // Unchanged from the original, already-shipped Novice→Pro policy
    // (`lib/promotion/config.ts`'s `DEFAULT_PROMOTION_POLICY`, kept there
    // for backward-compatible reads of `promotion_policy_values` — this is
    // the same values re-declared under the generalized shape). No
    // profitability bar, by explicit project-owner instruction: this
    // transition should stay comparatively easy.
    minCompletedTrades: 25,
    minAccountAgeDays: 60,
    minExecutionScore: 80,
    minStopAdherenceRatio: 0.9,
    minPositionSizeComplianceRatio: 0.95,
    riskStateLookbackDays: 30,
    severeDrawdownPct: 8,
    minCumulativeReturnPct: 0,
    minExpectancyR: 0,
  },
  pro_to_expert: {
    minCompletedTrades: 50,
    minAccountAgeDays: 90,
    minExecutionScore: 85,
    minStopAdherenceRatio: 0.93,
    minPositionSizeComplianceRatio: 0.96,
    riskStateLookbackDays: 30,
    severeDrawdownPct: 8,
    // A modest, real profitability floor — roughly the first-phase profit
    // target structural precedent from funded-account evaluation programs
    // (see module doc above), not a GSPS-measured figure.
    minCumulativeReturnPct: 8,
    // Meaningfully positive but well below GSPS's own measured Execute-
    // bucket average (+0.362R) — Pro-level candidates aren't expected to
    // already match GSPS's own best-measured bucket; that bar is reserved
    // for Expert→Wall Street below.
    minExpectancyR: 0.15,
  },
  expert_to_wall_street: {
    minCompletedTrades: 100,
    minAccountAgeDays: 180,
    minExecutionScore: 92,
    minStopAdherenceRatio: 0.96,
    minPositionSizeComplianceRatio: 0.98,
    // Longer and stricter than the lower two transitions — a recent close
    // call matters more immediately below the tier that unlocks autonomous
    // live trading.
    riskStateLookbackDays: 45,
    severeDrawdownPct: 6,
    minCumulativeReturnPct: 20,
    // Close to GSPS's own measured Execute-bucket expectancy (+0.362R,
    // 2026-09-23 run) — a Wall Street-via-track-record candidate must
    // trade approximately as well as GSPS's own top-scoring setups
    // measured, since this tier trusts an autonomous system with the
    // user's money.
    minExpectancyR: 0.3,
  },
};

/** `minCumulativeReturnPct` expressed as a dollar figure against the fixed paper starting balance, for display. */
export function minCumulativeReturnUsd(policy: TrackRecordPolicy): number {
  return Math.round((policy.minCumulativeReturnPct / 100) * STARTING_CASH);
}
