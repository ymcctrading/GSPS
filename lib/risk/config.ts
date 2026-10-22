/**
 * Novice Risk, Account & Cooldown Engine — constants.
 *
 * Source: "Novice Risk, Account & Cooldown Engine" spec pack (2026-08-28).
 * Everything here is a number or a threshold from that pack; the modules in
 * this directory are the logic that reads them. Nothing here is a rate of
 * return claim.
 *
 * The pack's risk-band ladder (1 to 1.75% of equity by experience, a 2% cap)
 * was removed with the band policy it fed (R-004, 2026-10-21/22): Gann's
 * capital rules size and refuse every order (`lib/risk/gannCapital.ts`).
 */

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

/**
 * Position, allocation, and correlation ceilings. There is no daily count of
 * new positions (Q8, Gann sets none; R-019, 2026-10-21): the open-market
 * count is Gann's (`lib/risk/gannCapital.ts`, five stocks, three other
 * markets). `entry_pause` stays a state for stored rows and the enum in
 * migration 0042, but nothing triggers it now.
 */
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
