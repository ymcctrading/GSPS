/**
 * Approved GSPS customer-facing terminology.
 *
 * Import labels and copy from here instead of hardcoding them, so the
 * naming stays consistent across the UI, exports, and TradingView metadata,
 * and so a future rename only touches one file. See
 * `docs/GSPS_BRAND_GUIDE.md` for the rationale behind each choice.
 */

export const GSPS_FULL_NAME = "GSPS — Guided Stock Projection System";
export const GSPS_SHORT_NAME = "GSPS";

export const GSPS_DESCRIPTION =
  "GSPS is a guided trade-planning system that helps traders turn market movement into clear, risk-defined trade scenarios.";

export const GSPS_TAGLINES = [
  "See the setup. Plan the trade. Manage the risk.",
  "Turn market movement into a clear trade plan.",
  "Know the setup before you take the trade.",
  "Clear scenarios. Defined risk. Better trade planning.",
  "Plan the trade before the market moves.",
  "A clearer way to prepare for the next move.",
] as const;

export const GSPS_DISCLAIMER =
  "GSPS provides market-analysis and trade-planning tools for educational and informational purposes only. It is not financial advice, investment advice, or a recommendation to buy or sell any security. Trading involves risk, including possible loss of principal. Past performance and projected levels do not guarantee future results.";

export const GSPS_RISK_REMINDER =
  "Only take trades that fit your personal risk limits. GSPS provides planning tools and market-analysis support; it does not guarantee results.";

/** Approved customer-facing labels for trade-plan fields. */
export const GSPS_LABELS = {
  entryZone: "Entry Zone",
  firstTarget: "First Target",
  finalTarget: "Final Target",
  riskLevel: "Risk Level",
  marketOutlook: "Market Outlook",
  pivotPlan: "Pivot Plan",
  setupStrength: "Setup Strength",
  trendCheck: "Trend Check",
  tradeMap: "Trade Map",
  watchlist: "Watchlist",
  opportunityList: "Opportunity List",
  dailyPlan: "Daily Plan",
  pricePath: "Price Path",
  keyLevel: "Key Level",
  confirmation: "Confirmation",
} as const;

/** Plain-language tooltip copy for the fields above. */
export const GSPS_TOOLTIPS: Record<keyof typeof GSPS_LABELS, string> = {
  entryZone: "A price area where the setup may become actionable after confirmation.",
  firstTarget: "A potential area to consider taking partial profits or reviewing the trade.",
  finalTarget: "A projected price area where the current trade plan may be completed or reassessed.",
  riskLevel: "The price level where the original trade idea may no longer be valid.",
  marketOutlook: "The setup's current bias — upward, downward, or neutral.",
  pivotPlan: "A backup scenario that explains what to watch if price moves against the initial outlook.",
  setupStrength:
    "A summary of how many GSPS conditions are currently aligned. It is not a guarantee of trade success.",
  trendCheck: "Confirmation from a higher timeframe that the setup's direction still holds.",
  tradeMap: "The full trade plan for this setup: outlook, entry, targets, risk level, and pivot scenario.",
  watchlist: "Setups you're tracking but haven't acted on yet.",
  opportunityList: "Today's ranked list of setups worth reviewing.",
  dailyPlan: "A daily summary of the market's most notable setups.",
  pricePath: "The projected path price may take through the plan's levels.",
  keyLevel: "A price level the setup treats as significant.",
  confirmation: "A signal that the setup has met its criteria to act on.",
};

/** Setup-status labels: use these, not emotionally charged alternatives. */
export const GSPS_STATUS_LABELS = [
  "Watch",
  "Building",
  "Ready for Confirmation",
  "Active",
  "Target Reached",
  "Risk Level Reached",
  "Reassess",
  "No Clear Setup",
] as const;

/**
 * Internal-term → approved customer-facing label. Reference for copywriting
 * and for `scripts/check-banned-terms.mjs`'s "instead" suggestions — not
 * meant to be applied as an automatic string replacement, since the internal
 * terms remain valid identifiers in server-only code.
 */
export const GSPS_TERM_REPLACEMENTS: Record<string, string> = {
  "Gann Root": "Setup Signal",
  "Harmonic Vector": "Price Path",
  "Harmonic Node": "Key Price Level",
  "Material Number": "Major Price Level",
  "Invalidation Vector": "Risk Level",
  "Master Target": "Final Target",
  "Minor Node": "First Target",
  "Decimal-Strip Modulo-9 Reduction": "GSPS Signal Calculation",
  "Bullish Momentum": "Upward Setup",
  "Bearish Mean Reversion": "Downward Setup",
  "Reversal Vector": "Pivot Scenario",
  "Coordinate Execution Matrix": "GSPS Trade Map",
};
