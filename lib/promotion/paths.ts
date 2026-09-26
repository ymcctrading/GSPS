/**
 * The top-level three-path promotion decision: is a profile eligible for
 * `transition` through *any* of Curriculum, Track Record, or Pay Your Way —
 * each independently sufficient, except for one shared, mandatory
 * component (today: only Expert→Wall Street's live-trading risk capstone,
 * see `curriculumPolicy.ts`'s module doc for why that one is not optional).
 */

import { evaluateCurriculumEligibility, mandatoryComponentMet, type CurriculumProgressInputs } from "./curriculumPolicy";
import { evaluateTrackRecordEligibility, type TrackRecordEligibility, type TrackRecordInputs } from "./eligibility";
import type { TrackRecordPolicy } from "./trackRecordPolicy";
import type { PromotionPath, TierTransition } from "./transitions";

export interface PromotionPathsResult {
  transition: TierTransition;
  /** False only for expert_to_wall_street when the capstone isn't complete — no path can clear the transition without it. */
  mandatoryComponentMet: boolean;
  curriculumEligible: boolean;
  trackRecord: TrackRecordEligibility;
  /** Whether a completed pay-your-way purchase exists for this transition (see `lib/promotion/promote.ts`). */
  payYourWayPurchased: boolean;
  /** Every path currently sufficient to clear this transition, given `mandatoryComponentMet`. Empty if the mandatory component isn't met, regardless of the other three. */
  eligiblePaths: PromotionPath[];
  eligible: boolean;
}

export function evaluatePromotionPaths(
  transition: TierTransition,
  inputs: {
    curriculum: CurriculumProgressInputs;
    trackRecord: TrackRecordInputs;
    trackRecordPolicy: TrackRecordPolicy;
    payYourWayPurchased: boolean;
  },
): PromotionPathsResult {
  const mandatoryOk = mandatoryComponentMet(transition, inputs.curriculum);
  const curriculum = evaluateCurriculumEligibility(transition, inputs.curriculum);
  const trackRecord = evaluateTrackRecordEligibility(inputs.trackRecord, inputs.trackRecordPolicy);

  const eligiblePaths: PromotionPath[] = [];
  if (mandatoryOk) {
    if (curriculum.eligible) eligiblePaths.push("curriculum");
    if (trackRecord.eligible) eligiblePaths.push("track_record");
    if (inputs.payYourWayPurchased) eligiblePaths.push("pay_your_way");
  }

  return {
    transition,
    mandatoryComponentMet: mandatoryOk,
    curriculumEligible: curriculum.eligible,
    trackRecord,
    payYourWayPurchased: inputs.payYourWayPurchased,
    eligiblePaths,
    eligible: eligiblePaths.length > 0,
  };
}
