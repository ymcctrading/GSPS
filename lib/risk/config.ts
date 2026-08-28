/**
 * Novice Risk, Account & Cooldown Engine — constants.
 *
 * Source: "Novice Risk, Account & Cooldown Engine" spec pack (2026-08-28).
 * Everything here is a number or a threshold from that pack; the modules in
 * this directory are the logic that reads them. Nothing here is a rate of
 * return claim — the risk-band table is a ceiling on what a user may lose
 * per trade, never a promise of what they will make.
 *
 * "Novice" here is the risk-engine's own experience ladder (base → a_tier →
 * a_plus → exceptional_a_plus), not the billing tier of the same name in
 * lib/entitlements/policy.ts (Novice/Pro/Expert/Wall Street). A Pro-tier
 * account still starts on the base risk band until it has traded its way up
 * the ladder — the two concepts are independent and must not be conflated.
 */

/** The risk-band ladder, in ascending order of how much a trade may risk. */
export type RiskBand = "base" | "a_tier" | "a_plus" | "exceptional_a_plus";

export const RISK_BAND_ORDER: RiskBand[] = ["base", "a_tier", "a_plus", "exceptional_a_plus"];

/** Risk rate ceiling for each band, as a percent of equity (not a floor — see dynamic-risk.ts). */
export const RISK_BAND_RATE_PCT: Record<RiskBand, number> = {
  base: 1.0,
  a_tier: 1.25,
  a_plus: 1.5,
  exceptional_a_plus: 1.75,
};

/** Never exceeded regardless of score, band, or multipliers. Does not imply recommended use. */
export const ABSOLUTE_TIER_CAP_PCT = 2.0;

/**
 * Completed GSPS swing trades required before any risk increase above the
 * base rate — i.e. before a band above "base" may ever apply.
 */
export const MIN_TRADES_FOR_RISK_INCREASE = 20;

/**
 * The highest band (exceptional_a_plus) additionally requires a completed-trade
 * count inside this range, across varied conditions, no active cooldown, and no
 * repeated recent discipline breach — see dynamic-risk.ts `resolveRiskBand`.
 */
export const EXCEPTIONAL_BAND_MIN_TRADES = 40;
export const EXCEPTIONAL_BAND_MAX_TRADES = 50;

/** User execution score weights (sum to 1.0). */
export const EXECUTION_SCORE_WEIGHTS = {
  stopDiscipline: 0.25,
  positionSizing: 0.2,
  entryDiscipline: 0.15,
  exitPlanAdherence: 0.15,
  frequencyDiscipline: 0.1,
  correlationDiscipline: 0.1,
  journalCompletion: 0.05,
} as const;

/** Position, allocation, and correlation ceilings. */
export const MAX_NEW_POSITIONS_PER_DAY = 3;
export const MAX_TOTAL_OPEN_RISK_PCT = 2.0; // upper end of the 1.5-2.0% configured range
export const MIN_TOTAL_OPEN_RISK_PCT = 1.5;
export const MAX_SINGLE_POSITION_ALLOCATION_PCT = 25; // upper end of 20-25%
export const MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT = 65; // upper end of 50-65%
export const MAX_CORRELATED_RISK_GROUPS = 1; // at low equity ("at $450")

/** Circuit-breaker states, in ascending order of severity. */
export type CircuitState =
  | "normal"
  | "entry_pause"
  | "warning"
  | "soft_cooldown"
  | "hard_cooldown"
  | "critical_lock"
  | "emergency_lock"
  | "severe_override";

export const CIRCUIT_STATE_ORDER: CircuitState[] = [
  "normal",
  "entry_pause",
  "warning",
  "soft_cooldown",
  "hard_cooldown",
  "critical_lock",
  "emergency_lock",
  "severe_override",
];

/** Loss/drawdown thresholds that trigger each state, as percent magnitudes. */
export const WARNING_48H_LOSS_PCT = 2;
export const SOFT_COOLDOWN_48H_LOSS_PCT = 3;
export const HARD_COOLDOWN_48H_LOSS_PCT = 5;
export const CRITICAL_LOCK_30D_DRAWDOWN_PCT = 8;
export const EMERGENCY_LOCK_30D_DRAWDOWN_PCT = 12;
export const SEVERE_OVERRIDE_30D_DRAWDOWN_PCT = 18;

/** Blocked-duration triggers, in trading days. Entry pause/warning/soft cooldown are session-scoped, not day-counted. */
export const HARD_COOLDOWN_BLOCKED_DAYS = 1;
export const CRITICAL_LOCK_BLOCKED_DAYS = 5;
export const EMERGENCY_LOCK_BLOCKED_DAYS = 10;

/** Whether existing positions may be freely managed, or only risk-reduced, in each state. */
export const EXISTING_POSITIONS_RESTRICTED: Record<CircuitState, boolean> = {
  normal: false,
  entry_pause: false,
  warning: false,
  soft_cooldown: false,
  hard_cooldown: true,
  critical_lock: true,
  emergency_lock: true,
  severe_override: true,
};

/** Actions a cooldown/lock of any severity never blocks. */
export type AlwaysPermittedAction =
  | "stop_loss"
  | "take_profit"
  | "position_reduce"
  | "position_close"
  | "cancel_pending_entry";

export const ALWAYS_PERMITTED_ACTIONS: ReadonlySet<AlwaysPermittedAction> = new Set([
  "stop_loss",
  "take_profit",
  "position_reduce",
  "position_close",
  "cancel_pending_entry",
]);

export const ESTIMATE_LABEL = "GSPS estimate based on user-entered holdings.";
