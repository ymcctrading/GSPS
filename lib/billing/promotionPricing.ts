/**
 * Pay-to-play tier-promotion pricing — one of GSPS's three independent
 * promotion paths (see `lib/promotion/transitions.ts`).
 *
 * Three-question mandate:
 * 1. Gann sourcing: N/A — pricing is a business decision, not a market
 *    technique.
 * 2. Dewey/cycle theory: N/A — no periodicity claim.
 * 3. Hermetic principle: **Polarity**, same as the other two paths — this
 *    is capital as the third pole of qualification, alongside discipline
 *    (curriculum) and demonstrated performance (track record). Priced so
 *    it is real but deliberately the *worse* pole economically, per direct
 *    project-owner instruction: "least attractive/feasible option for
 *    someone without discretionary capital."
 *
 * ---
 *
 * ## Pricing proposal — NOT yet approved, NOT yet wired to Stripe
 *
 * These figures are a proposal for project-owner approval, following the
 * same "propose figures, don't activate billing" instruction under which
 * this module was built (2026-09-25). `isPromotionBillingEnabled()` is
 * `false` until real Stripe Price ids exist, exactly mirroring
 * `lib/billing/stripe.ts`'s own "needs a real Stripe account before
 * launch" posture — no checkout can go live from this module alone.
 *
 * **The reasoning, transition by transition:**
 *
 * - **novice_to_pro**: Pro (`STANDARD`) is a **free** tier
 *   (`lib/tiers.ts#TIER_META`, `monthlyUsd: 0`) — curriculum and track
 *   record both reach it at zero additional cost. A pay-to-play price here
 *   only has to clear one bar to be "the worst deal": be above zero.
 *   Proposed: **$49 one-time.** Framed as "skip the wait," not as buying
 *   something curriculum/track record don't already give for free.
 * - **pro_to_expert**: Expert (`INVESTOR_MODE`) is a paid subscription
 *   (`$99/mo`, `$990/yr`) regardless of promotion path — paying to skip
 *   readiness does not replace that subscription, it only removes the
 *   curriculum/track-record requirement gating who may subscribe. Proposed:
 *   **$499 one-time, in addition to the standard subscription.** A
 *   candidate who earns Expert via curriculum or track record pays nothing
 *   beyond the subscription every Expert user already pays; a pay-to-play
 *   candidate pays that same subscription *plus* this premium — strictly
 *   worse, by construction, not by a persuasive framing choice.
 * - **expert_to_wall_street**: Wall Street (`SYSTEM_MASTERY`) is `$299/mo`.
 *   Proposed: **$1,499 one-time, in addition to the standard subscription**,
 *   still requiring the mandatory live-trading risk capstone
 *   (`lib/promotion/curriculumPolicy.ts`'s `mandatoryComponentMet`) — payment
 *   never substitutes for that safety gate, per direct project-owner
 *   decision (2026-09-25). The premium scales with the earlier one roughly
 *   in proportion to the subscription gap ($99->$299 is a ~3x jump; $499->
 *   $1,499 mirrors that), rather than being picked independently.
 *
 * No figure here is derived from GSPS's own revenue data (none exists yet
 * for a pre-launch product) — they are proposals sized against the
 * platform's own existing subscription prices, for the project owner to
 * approve, adjust, or reject before any Stripe product is created.
 */

import type { TierTransition } from "@/lib/promotion/transitions";

export interface PromotionPriceProposal {
  /** Proposed one-time fee, in cents. */
  amountCents: number;
  /** True when this transition's target tier still carries its own ongoing subscription regardless of path. */
  subscriptionStillRequired: boolean;
}

export const PROMOTION_PRICE_PROPOSALS: Record<TierTransition, PromotionPriceProposal> = {
  novice_to_pro: { amountCents: 4_900, subscriptionStillRequired: false },
  pro_to_expert: { amountCents: 49_900, subscriptionStillRequired: true },
  expert_to_wall_street: { amountCents: 149_900, subscriptionStillRequired: true },
};

const PRICE_ENV_VAR: Record<TierTransition, string> = {
  novice_to_pro: "STRIPE_PRICE_PROMOTION_NOVICE_TO_PRO",
  pro_to_expert: "STRIPE_PRICE_PROMOTION_PRO_TO_EXPERT",
  expert_to_wall_street: "STRIPE_PRICE_PROMOTION_EXPERT_TO_WALL_STREET",
};

/** False until a real Stripe secret key and at least one promotion Price id are configured. */
export function isPromotionBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && Object.values(PRICE_ENV_VAR).some((v) => Boolean(process.env[v]));
}

/** The Stripe Price id for a transition's pay-to-play fee, or null if unset. */
export function promotionPriceIdFor(transition: TierTransition): string | null {
  return process.env[PRICE_ENV_VAR[transition]] ?? null;
}
