/**
 * Required/forbidden wording for tier-promotion and Novice-experience copy.
 *
 * Source: "Tier Access, Promotion & User Experience" spec pack (2026-08-28),
 * "Required wording". Scoped to promotion-related UI, not a site-wide
 * banned-word gate — several forbidden phrases here ("safe", "best trade")
 * are ordinary words in unrelated contexts, so this is enforced by a
 * targeted test (`lib/promotion/__tests__/copy.test.ts`) over the strings
 * this module exports, not by `scripts/check-banned-terms.mjs`.
 */

/** Approved vocabulary for promotion/eligibility copy — use these terms, not ad hoc phrasing. */
export const PROMOTION_APPROVED_TERMS = [
  "Rules Alignment",
  "trade plan",
  "scenario",
  "planned risk",
  "invalidates",
  "historical context",
] as const;

/** Never appear in promotion/eligibility copy, in any casing. */
export const PROMOTION_FORBIDDEN_PHRASES = [
  "guaranteed",
  "highly likely profit",
  "AI knows",
  "best trade",
  "safe",
  "automatic winner",
  "beat the market",
] as const;

/**
 * The only approved prompt after a discipline success (e.g. newly eligible
 * for Pro). Never shown in response to a loss, cooldown, or risk lock —
 * callers must gate that themselves; this string carries no urgency or
 * performance claim by design.
 */
export const NEUTRAL_UPGRADE_PROMPT = "You may be eligible to review additional educational tools.";

/** Novice homepage: phrased as a ceiling, never a target, per the spec pack. */
export function noviceEntriesAvailableTodayLabel(count: number): string {
  return `${count} new entr${count === 1 ? "y" : "ies"} available today (maximum)`;
}

export const NOT_OPERATIONALLY_VIABLE_LABEL = "Not operationally viable for this account configuration";

export const NO_QUALIFIED_SETUP_LABEL = "No qualified setup";

/** Plain-language label for a circuit-breaker state, for the Novice homepage's cooldown status card. */
export function cooldownStatusLabel(state: string): string {
  switch (state) {
    case "normal":
      return "No active cooldown";
    case "entry_pause":
      return "Entry pause — new entries briefly held";
    case "warning":
      return "Warning — approaching a cooldown threshold";
    case "soft_cooldown":
      return "Soft cooldown — new entries paused";
    case "hard_cooldown":
      return "Hard cooldown — new entries blocked";
    case "critical_lock":
      return "Critical lock — account under review";
    case "emergency_lock":
      return "Emergency lock — new entries blocked pending reset";
    case "severe_override":
      return "Severe override — manual reset required";
    default:
      return "No active cooldown";
  }
}

/** Case-insensitive check for a forbidden phrase in a block of promotion-related copy. */
export function containsForbiddenPromotionPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  return PROMOTION_FORBIDDEN_PHRASES.find((phrase) => lower.includes(phrase.toLowerCase())) ?? null;
}
