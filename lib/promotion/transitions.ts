/**
 * Shared vocabulary for the three tier-promotion transitions and the three
 * paths a user can clear any one of them by.
 *
 * Three-question mandate (AGENTS.md), applied to this module — the shared
 * types every other promotion module builds on:
 * 1. Gann sourcing: N/A. This is an access/governance ladder, not a market
 *    technique.
 * 2. Dewey/cycle theory: the promotion ladder is a repeating structure (a
 *    user can, in principle, keep ascending), and each transition's Track
 *    Record path is itself a rolling evaluation window — see
 *    `trackRecordPolicy.ts` for where Dewey's checklist is actually run
 *    against that claim.
 * 3. Hermetic principle: **Polarity** — three genuinely different poles of
 *    qualification (discipline/study, demonstrated performance, capital),
 *    not one path with two lesser copies — held together as one coherent
 *    ladder. **Cause and Effect** as well: each path is a different kind of
 *    evidence a user offers as the "cause" that earns the "effect" of a
 *    higher tier. See AGENTS.md's "Three-path tier promotion" section for
 *    the full design writeup.
 */

import type { PlatformTier } from "@/lib/tiers";

export const TIER_TRANSITIONS = ["novice_to_pro", "pro_to_expert", "expert_to_wall_street"] as const;
export type TierTransition = (typeof TIER_TRANSITIONS)[number];

export const PROMOTION_PATHS = ["curriculum", "track_record", "pay_to_play"] as const;
export type PromotionPath = (typeof PROMOTION_PATHS)[number];

export interface TransitionTiers {
  from: PlatformTier;
  to: PlatformTier;
}

/** The exact (fromTier, toTier) pair each transition moves a profile between. */
export const TRANSITION_TIERS: Record<TierTransition, TransitionTiers> = {
  novice_to_pro: { from: "PRACTICE", to: "STANDARD" },
  pro_to_expert: { from: "STANDARD", to: "INVESTOR_MODE" },
  expert_to_wall_street: { from: "INVESTOR_MODE", to: "SYSTEM_MASTERY" },
};

/** The transition, if any, whose `from` tier is `tier` — the "next rung" for a profile on that tier. */
export function nextTransitionFor(tier: PlatformTier): TierTransition | null {
  return (TIER_TRANSITIONS.find((t) => TRANSITION_TIERS[t].from === tier) ?? null) as TierTransition | null;
}

/** Plain-language names for UI copy — never invent a label ad hoc elsewhere. */
export const TRANSITION_LABELS: Record<TierTransition, string> = {
  novice_to_pro: "Novice → Pro",
  pro_to_expert: "Pro → Expert",
  expert_to_wall_street: "Expert → Wall Street",
};

export const PATH_LABELS: Record<PromotionPath, string> = {
  curriculum: "Curriculum completion",
  track_record: "Track record",
  pay_to_play: "Pay to play",
};
