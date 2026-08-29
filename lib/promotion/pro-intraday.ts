/**
 * Intraday-sourced order gates.
 *
 * These four gates apply only to an order tagged `intraday_sourced` — one
 * opened through the intraday alerts panel's "Trade this" action (see
 * components/scan/intraday-alerts.tsx), not a manual ticket opened any other
 * way. Applying them to every order regardless of source would conflate two
 * different questions: "is this account managing risk well overall"
 * (lib/risk/circuit-breaker.ts already answers that, for every order) and
 * "is this account chasing intraday alerts past the point of discipline"
 * (this module).
 *
 * All four evaluate fresh from the day's intraday-sourced order and trade
 * history — nothing here is a stored "currently locked" flag that needs an
 * explicit reset. A gate that trips mid-session clears itself the same way
 * it tripped: the inputs change (a new trading day starts, a loss ages out
 * of today's window) and the next evaluation reflects that.
 *
 * Scope, deliberately: these gate the *entry* only. Same rule
 * lib/risk/cooldown.ts encodes for the account-wide circuit breaker — a stop
 * loss, take profit, position reduction, position closure, or cancellation
 * of a pending entry is never blocked, tripped gate or not. This module has
 * no caller for those actions because "Trade this" only ever opens a
 * position; closes route through the dedicated close action, which never
 * carries the intraday-sourced tag. See lib/trade/place-order.ts for where
 * this is wired in.
 */

export interface IntradayGateInputs {
  /** Intraday-sourced entry orders already placed today (filled or resting; rejected orders don't count). */
  entriesToday: number;
  /** Intraday-sourced positions currently open. */
  openPositions: number;
  /** Intraday-sourced trades closed at a loss, most recent first, unbroken by a win since. */
  consecutiveLosses: number;
  /** Realized P&L today from intraday-sourced trades only (negative = net loss). */
  realizedPnlTodayUsd: number;
  /** Account equity the daily-loss-lock percentage is measured against. */
  equity: number;
}

export const MAX_INTRADAY_ENTRIES_PER_DAY = 3;
export const MAX_INTRADAY_CONCURRENT_POSITIONS = 2;
export const MAX_INTRADAY_CONSECUTIVE_LOSSES = 3;
export const INTRADAY_DAILY_LOSS_LOCK_PCT = 2;

export type IntradayGateCode =
  | "entry_per_day"
  | "concurrent_position"
  | "consecutive_loss"
  | "daily_loss_lock";

export interface IntradayGateVerdict {
  allowed: boolean;
  /** Which gate blocked the entry; null when allowed. */
  code: IntradayGateCode | null;
  /** Human-readable reason for the ticket/API response; null when allowed. */
  reason: string | null;
}

/**
 * Evaluates the four intraday-promotion gates in a fixed order — entry/day,
 * concurrent-position, consecutive-loss, then daily-loss-lock — and returns
 * the first one that blocks. Order matters only for which reason is shown;
 * a caller failing more than one gate is still just refused.
 */
export function evaluateIntradayEntryGates(inputs: IntradayGateInputs): IntradayGateVerdict {
  if (inputs.entriesToday >= MAX_INTRADAY_ENTRIES_PER_DAY) {
    return {
      allowed: false,
      code: "entry_per_day",
      reason: `${inputs.entriesToday} intraday-sourced entries already placed today (limit ${MAX_INTRADAY_ENTRIES_PER_DAY}/day). This resets at the next trading day.`,
    };
  }

  if (inputs.openPositions >= MAX_INTRADAY_CONCURRENT_POSITIONS) {
    return {
      allowed: false,
      code: "concurrent_position",
      reason: `${inputs.openPositions} intraday-sourced positions already open (limit ${MAX_INTRADAY_CONCURRENT_POSITIONS} concurrent). Close one before opening another.`,
    };
  }

  if (inputs.consecutiveLosses >= MAX_INTRADAY_CONSECUTIVE_LOSSES) {
    return {
      allowed: false,
      code: "consecutive_loss",
      reason: `${inputs.consecutiveLosses} consecutive intraday-sourced losses (limit ${MAX_INTRADAY_CONSECUTIVE_LOSSES}). Locked for the rest of today's trading day.`,
    };
  }

  if (inputs.equity > 0 && inputs.realizedPnlTodayUsd < 0) {
    const lossPct = (Math.abs(inputs.realizedPnlTodayUsd) / inputs.equity) * 100;
    if (lossPct >= INTRADAY_DAILY_LOSS_LOCK_PCT) {
      return {
        allowed: false,
        code: "daily_loss_lock",
        reason: `Intraday-sourced realized loss today reached ${lossPct.toFixed(2)}% of equity (limit ${INTRADAY_DAILY_LOSS_LOCK_PCT}%). Locked for the rest of today's trading day.`,
      };
    }
  }

  return { allowed: true, code: null, reason: null };
}
