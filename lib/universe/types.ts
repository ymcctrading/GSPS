/**
 * Shared types for the Novice Market Universe engine.
 *
 * Source: "Market Universe, Data Quality & Account Constraints" spec pack
 * (2026-08-28) — draft implementation directives, requires
 * securities/compliance counsel review before use in live personalized
 * recommendations or execution.
 *
 * This is a new, separate gate from every existing filter in the codebase
 * (`lib/scan/liquidity.ts`'s platform-wide floor, `lib/signals/disqualifiers.ts`'s
 * scanner-state gates). It is the *coarse* gate the spec calls
 * `novice_eligible` — whether a symbol belongs in front of a novice at all —
 * evaluated before any scanner state, signal, or account-risk read runs. See
 * `docs/MARKET_UNIVERSE_DATA_QUALITY.md` for how it composes with those.
 */

/** One named filter's outcome. `pass: false` always carries a human-readable reason. */
export interface UniverseFilterResult {
  key: string;
  pass: boolean;
  reason: string | null;
}

/**
 * `novice_eligible = market_cap_pass AND liquidity_pass AND
 * price_or_fractional_pass AND spread_pass AND event_risk_pass AND
 * volatility_pass AND data_quality_pass`, per spec — the exact boolean
 * formula, not a score. Every component is reported even when an earlier one
 * already failed, so a caller can show every reason at once rather than only
 * the first.
 */
export interface NoviceEligibility {
  eligible: boolean;
  filters: UniverseFilterResult[];
  /** `filters` flattened to just the failing reasons, in evaluation order. */
  reasons: string[];
}

/**
 * `trade_qualified = novice_eligible AND regime_pass AND confirmation_pass
 * AND target_path_pass AND account_risk_pass`, per spec. This layer does not
 * re-implement regime/confirmation/target-path — those are the existing
 * Signal and Regime Engine (`lib/signals`) and Guided eligibility
 * (`lib/guided/eligibility.ts`) verdicts, passed in already computed so this
 * module stays a pure composition rather than a second copy of that logic.
 */
export interface TradeQualification {
  qualified: boolean;
  noviceEligible: NoviceEligibility;
  regimePass: boolean;
  confirmationPass: boolean;
  targetPathPass: boolean;
  accountRiskPass: boolean;
  reasons: string[];
}

/**
 * How a data point was obtained. Used across every filter that reads
 * external data (market cap, spread, events, account) so a caller can render
 * the spec's required provenance label rather than presenting simulated or
 * stale data as fact.
 */
export type DataProvenance = "broker_verified" | "vendor_live" | "manual" | "delayed" | "simulated" | "unavailable";

/** `true`/`false`/unknown, where unknown must default to the spec's stated fail-safe rather than a guess. */
export type TriState = boolean | "unknown";
