/**
 * Curriculum path — per-transition GSPS School gate, one of GSPS's three
 * independent tier-promotion paths (see `transitions.ts`).
 *
 * Reuses what GSPS School already tracks rather than inventing a parallel
 * completion record — see `docs/GSPS_SCHOOL.md`'s "Gate behavior" section
 * for what each of these columns already means and where it's written:
 *
 * - `novice_to_pro`: Academies 1-3 (Foundations) already write
 *   `promotion_progress.education_completed_at` and
 *   `promotion_progress.practice_validation_completed_at`. Both existed
 *   before this module and are read, not duplicated.
 * - `pro_to_expert`: Academies 4-7 ("Sharpening the Edge" / "Professional
 *   Toolkit") were, until this change, advisory-only — no completion flag
 *   fed anything. This module's `curriculum_completed_at` (new,
 *   `tier_promotions_progress`) is the first thing that reads their
 *   completion as sufficient for a real promotion path. Academies 4-7
 *   themselves are unchanged; only this new consumer of their completion
 *   state is new.
 * - `expert_to_wall_street`: Academy 8's capstone already writes
 *   `live_trading_restrictions.wall_street_school_completed_at`, and the
 *   Wall Street checkout route already refuses without it. **That
 *   requirement does not become optional under the three-path model** —
 *   see the module doc below.
 *
 * **The one hard rule this module encodes, by direct project-owner
 * decision (2026-09-25):** Wall Street unlocks autonomous live-money
 * trading (`autonomous_portfolio_manager`, Wall-Street-only per
 * `lib/tiers.ts`). The capstone's live-trading risk/settlement/gaps/
 * slippage/account-type education is treated as a safety prerequisite, not
 * a monetization lever — it is required for **every** path to Wall Street,
 * curriculum, track record, or pay-your-way alike. This is the one place
 * the "three independent paths" model has a shared, non-optional
 * component; it is deliberate, not an oversight, and it should not be
 * "cleaned up" into full path independence by a future session without
 * going back to the project owner first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TierTransition } from "./transitions";
import { examPassedAt } from "@/lib/school/examService";

export interface CurriculumProgressInputs {
  /** Academies 1-3 fully passed (education) — novice_to_pro only. */
  foundationsEducationCompletedAt: string | null;
  /** The paper-trading/intraday-simulation validation lesson — novice_to_pro only. */
  practiceValidationCompletedAt: string | null;
  /** Academies 4-7 fully passed — pro_to_expert only. */
  advancedCurriculumCompletedAt: string | null;
  /** Academy 8 capstone + dossier lab passed — expert_to_wall_street only, also the mandatory safety gate. */
  capstoneCompletedAt: string | null;
  /** The Novice graduation exam passed (lib/school/graduationExam.ts) — novice_to_pro's mandatory component. */
  noviceExamPassedAt?: string | null;
  /** The Pro graduation exam passed — pro_to_expert's mandatory component. */
  proExamPassedAt?: string | null;
}

export interface CurriculumEligibility {
  eligible: boolean;
  /** Whether this transition's path-independent component is met (the graduation exam, or Wall Street's capstone). */
  mandatoryComponentMet: boolean;
}

/** Pure evaluation — does the curriculum path, on its own, clear this transition? */
export function evaluateCurriculumEligibility(
  transition: TierTransition,
  inputs: CurriculumProgressInputs,
): CurriculumEligibility {
  switch (transition) {
    case "novice_to_pro":
      return {
        eligible: inputs.foundationsEducationCompletedAt != null && inputs.practiceValidationCompletedAt != null,
        mandatoryComponentMet: inputs.noviceExamPassedAt != null,
      };
    case "pro_to_expert":
      return {
        eligible: inputs.advancedCurriculumCompletedAt != null,
        mandatoryComponentMet: inputs.proExamPassedAt != null,
      };
    case "expert_to_wall_street":
      return {
        eligible: inputs.capstoneCompletedAt != null,
        mandatoryComponentMet: inputs.capstoneCompletedAt != null,
      };
  }
}

/**
 * Whether the transition's mandatory, path-independent safety component is
 * met — checked once and required regardless of which of the three paths a
 * profile otherwise qualifies through. Wall Street: the live-trading risk
 * capstone (owner, 2026-09-25). Novice -> Pro and Pro -> Expert: the
 * graduation exam in that tier's sandbox (owner, 2026-09-28: a student shows
 * they can apply what they learned before moving up, whichever path they
 * take, pay-your-way included).
 */
export function mandatoryComponentMet(transition: TierTransition, inputs: CurriculumProgressInputs): boolean {
  switch (transition) {
    case "novice_to_pro":
      return inputs.noviceExamPassedAt != null;
    case "pro_to_expert":
      return inputs.proExamPassedAt != null;
    case "expert_to_wall_street":
      return inputs.capstoneCompletedAt != null;
  }
}

/**
 * Server-only read of a profile's curriculum progress across every
 * transition's inputs at once — cheaper than three separate round trips,
 * and the caller only ever needs the one field relevant to the transition
 * being evaluated.
 */
export async function gatherCurriculumProgressInputs(
  supabase: SupabaseClient,
  profileId: string,
): Promise<CurriculumProgressInputs> {
  const [{ data: legacyProgress }, { data: tierProgress }, { data: liveRestrictions }, noviceExamPassedAt, proExamPassedAt] = await Promise.all([
    supabase
      .from("promotion_progress")
      .select("education_completed_at, practice_validation_completed_at")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("tier_promotions_progress")
      .select("transition, curriculum_completed_at")
      .eq("profile_id", profileId)
      .eq("transition", "pro_to_expert")
      .maybeSingle(),
    supabase
      .from("live_trading_restrictions")
      .select("wall_street_school_completed_at")
      .eq("user_id", profileId)
      .maybeSingle(),
    examPassedAt(supabase, profileId, "novice_to_pro"),
    examPassedAt(supabase, profileId, "pro_to_expert"),
  ]);

  return {
    foundationsEducationCompletedAt: legacyProgress?.education_completed_at ?? null,
    practiceValidationCompletedAt: legacyProgress?.practice_validation_completed_at ?? null,
    advancedCurriculumCompletedAt: tierProgress?.curriculum_completed_at ?? null,
    capstoneCompletedAt: liveRestrictions?.wall_street_school_completed_at ?? null,
    noviceExamPassedAt,
    proExamPassedAt,
  };
}
