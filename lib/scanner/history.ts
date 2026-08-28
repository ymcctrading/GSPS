/**
 * Scan history — what a manual scan told a user, and what it says now.
 * -----------------------------------------------------------------------------
 * `/api/batch-scan` already runs a scan and shows results; it never kept a
 * record of them, so a user who scanned a batch of symbols and came back
 * later had no way to see whether an Execute had since expired or a Reject
 * had turned into a real setup. This module is the shared vocabulary between
 * the write side (`app/api/batch-scan/route.ts`, which persists each scan's
 * results to `public.scan_results`) and the read side
 * (`app/api/scan-history/route.ts`, which joins those against
 * `public.active_monitors` — the entitlement notification system's own
 * live WATCH/EXECUTE/INVALIDATED tracker, kept current by every scan that
 * touches a symbol, of any source, for that profile).
 *
 * The comparison this module exists to support is deliberately asymmetric:
 * `scannedState` is a snapshot ("what the scan said that day"), `currentState`
 * is a live read of infrastructure this feature does not own or refresh
 * itself. When no monitor row exists for a symbol — most commonly a Reject
 * that has not since become a real setup for this profile — there is nothing
 * honest to report as "current", so it is left null rather than guessed at.
 */

/** Vocabulary a scan itself produces (`ScanDecision.outputState`). */
export type ScannedState = "Execute" | "Watch" | "Reject";

/** Vocabulary `active_monitors.state` (migration 0036) actually stores. */
export type MonitorState = "WATCH" | "EXECUTE" | "INVALIDATED" | "NO_SETUP" | "EXPIRED";

/**
 * `MonitorState`, in the same words a scan uses, for the one-line comparison
 * a history row shows. `INVALIDATED`/`NO_SETUP`/`EXPIRED` are all "not a live
 * setup any more" but for different reasons, and the reason is worth keeping
 * — an EXPIRED setup and one that never armed at all are different findings,
 * even though both compare as "not Execute/Watch" against a scanned verdict.
 */
export const MONITOR_STATE_LABELS: Record<MonitorState, string> = {
  WATCH: "Watch",
  EXECUTE: "Execute",
  INVALIDATED: "No longer valid",
  NO_SETUP: "No setup now",
  EXPIRED: "Expired",
};

/** Whether a monitor state reads as the same verdict a scan would have given. */
export function monitorMatchesScannedState(monitor: MonitorState, scanned: ScannedState): boolean {
  if (monitor === "EXECUTE") return scanned === "Execute";
  if (monitor === "WATCH") return scanned === "Watch";
  // INVALIDATED / NO_SETUP / EXPIRED all read as "no longer a live setup" —
  // the closest a monitor gets to Reject, without claiming to be a rescan.
  return scanned === "Reject";
}

export interface ScanHistorySymbol {
  symbol: string;
  assetClass: string;
  direction: "bullish" | "bearish" | "none";
  scannedState: ScannedState;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  /** Null when no monitor has ever tracked this symbol for this profile. */
  currentState: MonitorState | null;
  currentStateAsOf: string | null;
  /**
   * True only when a current state exists and disagrees with the scanned
   * one. Null (not false) when there's nothing to compare against, so the UI
   * can tell "confirmed unchanged" apart from "unknown".
   */
  changed: boolean | null;
}

export interface ScanHistoryRun {
  scanExecutionId: string | null;
  runAt: string;
  symbols: ScanHistorySymbol[];
}

export function buildHistorySymbol(args: {
  symbol: string;
  assetClass: string;
  direction: "bullish" | "bearish" | "none";
  scannedState: ScannedState;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  currentState: MonitorState | null;
  currentStateAsOf: string | null;
}): ScanHistorySymbol {
  const { currentState, scannedState } = args;
  return {
    ...args,
    changed: currentState === null ? null : !monitorMatchesScannedState(currentState, scannedState),
  };
}
