/**
 * 24/7 out-of-hours execution state machine.
 *
 * Crypto never sleeps and Forex spans global overnight sessions, so the System
 * Mastery engine runs a resilient event loop that trails stops and locks in
 * dynamic profits untethered from the client UI.
 *
 *   IDLE -> EVALUATING -> EXECUTING -> MONITORING_TRAILING -> (EXIT) -> COOLDOWN -> IDLE
 */

export enum AutomationState {
  IDLE = "IDLE",
  EVALUATING = "EVALUATING",
  EXECUTING = "EXECUTING",
  MONITORING_TRAILING = "MONITORING_TRAILING",
  COOLDOWN = "COOLDOWN",
}

export interface ManagedAssetTracker {
  assetClass: "CRYPTO" | "FOREX";
  symbol: string;
  currentState: AutomationState;
  side: "LONG" | "SHORT";
  initialEntryPrice: number;
  /** For LONG: highest price seen. For SHORT: lowest price seen. */
  extremePrice: number;
  /** Absolute price distance the stop trails behind the extreme. */
  trailingStopDistance: number;
}

export type TrailingAction =
  | { action: "HOLD" }
  | { action: "UPDATE_STOP"; nextStopPrice: number }
  | { action: "EXIT"; stopPrice: number };

/**
 * Evaluate one tick against a trailing position. Mutates the tracker's
 * `extremePrice` when price advances in the trade's favor, and flips to
 * EXECUTING on a stop breach. Symmetric for long and short.
 */
export function evaluateTrailingStop(
  tracker: ManagedAssetTracker,
  currentPrice: number,
): TrailingAction {
  if (tracker.currentState !== AutomationState.MONITORING_TRAILING) {
    return { action: "HOLD" };
  }

  const isLong = tracker.side === "LONG";

  // Price moved further in our favor -> ratchet the stop.
  const advanced = isLong
    ? currentPrice > tracker.extremePrice
    : currentPrice < tracker.extremePrice;

  if (advanced) {
    tracker.extremePrice = currentPrice;
    const nextStopPrice = isLong
      ? currentPrice - tracker.trailingStopDistance
      : currentPrice + tracker.trailingStopDistance;
    return { action: "UPDATE_STOP", nextStopPrice };
  }

  // Check stop breach.
  const stopPrice = isLong
    ? tracker.extremePrice - tracker.trailingStopDistance
    : tracker.extremePrice + tracker.trailingStopDistance;

  const breached = isLong ? currentPrice <= stopPrice : currentPrice >= stopPrice;
  if (breached) {
    tracker.currentState = AutomationState.EXECUTING;
    return { action: "EXIT", stopPrice };
  }

  return { action: "HOLD" };
}
