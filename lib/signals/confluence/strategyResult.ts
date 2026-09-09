/**
 * Sara Confluence Layer `StrategyResult` adapter — "GSPS Implementation
 * Blueprint" §11.2's required strategy interface, built on top of the
 * existing, already-authorized Sara Confluence Layer
 * (`lib/signals/confluence/sara.ts`) rather than a new engine.
 * `SaraConfluenceResult` already carries
 * everything this needs; this is a pure reshape into the blueprint's exact
 * field/status vocabulary, not new signal logic.
 *
 * Two blueprint fields have no honest value yet, and this says so rather
 * than fabricating one:
 *   - `targets`/`timeStopBars`: target and time-stop construction belongs to
 *     the risk/trade-plan engine (blueprint §13.4), which Sara's module does
 *     not compute today — always `[]`/`null` here, not a guess.
 *   - `featureSnapshotId`: nothing in this codebase generates a persisted
 *     feature-snapshot id yet (blueprint §5.3's audit ledger is partial —
 *     see `docs/GANN_BLUEPRINT_TRACEABILITY.md`) — always `null`.
 *   - `confidenceScore`: Sara's own read is the binary
 *     armed-and-confirmed/not (`confirmationState`), not a calibrated
 *     probability — this reports that binary (1/0), not an invented score.
 */

import type { SaraConfluenceResult } from "./types";

export type StrategyResultStatus = "WATCH" | "DEVELOPING" | "ACTIONABLE" | "NO_TRADE";

export interface SaraStrategyResult {
  strategyId: string;
  strategyVersion: string;
  signalType: string | null;
  direction: string;
  status: StrategyResultStatus;
  entryTrigger: number | null;
  stopLoss: number | null;
  targets: number[];
  timeStopBars: number | null;
  confidenceScore: number;
  conditionsMet: string[];
  conditionsFailed: string[];
  featureSnapshotId: string | null;
}

/**
 * `entryTrigger`/`stopLoss` come from the caller's own armed-scenario read
 * (`lib/strat/patterns.ts`'s `StratPattern.triggerPrice`/`.stopPrice`) since
 * `SaraConfluenceResult` itself only carries the scenario's name/direction,
 * not its prices — those are stripped before the result crosses a
 * confluence-module boundary the same way every other module's raw
 * inputs are. Pass `null` for both when there's no armed scenario.
 */
export function toSaraStrategyResult(
  result: SaraConfluenceResult,
  scenarioPrices: { entryTrigger: number; stopLoss: number } | null,
): SaraStrategyResult {
  const dataOrMarketUnavailable = result.alignment === "notImplemented";
  const armed = result.confirmationState === "closedBarConfirmed";

  const status: StrategyResultStatus = dataOrMarketUnavailable ? "NO_TRADE" : armed ? "ACTIONABLE" : "WATCH";

  const conditionsMet: string[] = [];
  const conditionsFailed: string[] = [];

  if (dataOrMarketUnavailable) {
    conditionsFailed.push("market_data_unavailable");
  } else if (armed) {
    conditionsMet.push("pattern_armed_and_closed_bar_confirmed");
    if (result.timeframeContinuity === "confirmed") {
      conditionsMet.push("higher_timeframe_continuity_confirmed");
    } else if (result.alignment === "conflict") {
      conditionsFailed.push("higher_timeframe_continuity_conflict");
    }
  } else {
    conditionsFailed.push("no_armed_scenario");
  }

  return {
    strategyId: result.module.moduleId,
    strategyVersion: result.module.version,
    signalType: result.scenarioId,
    direction: result.direction,
    status,
    entryTrigger: armed ? (scenarioPrices?.entryTrigger ?? null) : null,
    stopLoss: armed ? (scenarioPrices?.stopLoss ?? null) : null,
    targets: [],
    timeStopBars: null,
    confidenceScore: armed ? 1 : 0,
    conditionsMet,
    conditionsFailed,
    featureSnapshotId: null,
  };
}
