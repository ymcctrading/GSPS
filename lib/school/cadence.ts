/**
 * Cadence Engine — level-appropriate pre-market/pre-trade/post-trade/daily/
 * weekly routines, per the product spec section 12. Built as in-app
 * scaffolding only (no scheduled server jobs — this project is on the
 * Vercel Hobby plan's 2-cron/day cap, already spent; see AGENTS.md /
 * docs/THIRD_PARTY_LIMITS.md). Never gamifies trading frequency: every
 * cadence item is a review/reflection prompt, not a trade-count target.
 */
export type CadenceKey = "pre_market" | "pre_trade" | "post_trade" | "daily" | "weekly";

export interface CadenceItem {
  key: CadenceKey;
  label: string;
  focus: readonly string[];
  /** Foundations onward — every learner sees this once Academy 1 is reachable. */
  academyIntroducedAt: string;
}

export const CADENCE_ITEMS: readonly CadenceItem[] = [
  {
    key: "pre_market",
    label: "Pre-Market",
    focus: ["Market-state review", "Watchlist conditions", "Known catalyst/event awareness", "Planned observation criteria"],
    academyIntroducedAt: "academy-1",
  },
  {
    key: "pre_trade",
    label: "Pre-Trade",
    focus: ["Confirm thesis", "Bear challenge", "Entry confirmation state", "Invalidation", "Allocated risk", "Position size", "Pause conditions"],
    academyIntroducedAt: "academy-3",
  },
  {
    key: "post_trade",
    label: "Post-Trade",
    focus: ["Plan-following classification", "Result/status", "Deviation", "Explanation", "One process lesson"],
    academyIntroducedAt: "academy-3",
  },
  {
    key: "daily",
    label: "Daily",
    focus: ["Execution discipline review", "Loss limits", "Unresolved positions", "Journal quality", "Whether activity should pause"],
    academyIntroducedAt: "academy-3",
  },
  {
    key: "weekly",
    label: "Weekly",
    focus: ["Repeated error patterns", "Measured metrics", "Learner-reported observations", "Performance attribution where supported", "Plan refinements"],
    academyIntroducedAt: "academy-8",
  },
] as const;
