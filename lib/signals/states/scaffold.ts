/**
 * Trend Breakout, Confirmed Reversal, and Range Reversion do not yet have a
 * deterministic v1 specification the way Trend Pullback does — the source
 * spec ("GSPS Signal and Regime Engine", Aug 28 2026) gives the shared
 * regime table and scoring/disqualifier framework for all four states, but
 * only writes out entry/stop/target logic for the bullish pullback case.
 *
 * Rather than invent numeric entry/stop/target rules for the other three
 * states that the spec never defined — which would fabricate exactly the
 * kind of undocumented rule this doctrine-driven engine exists to avoid —
 * each is wired into the same architecture (its own module, its own
 * `ScannerStateMeta`, isolated from the other three) but returns
 * `notImplemented` until a deterministic spec lands for it. See
 * `docs/SIGNAL_REGIME_ENGINE.md`.
 */

import { SCANNER_STATE_META, type ScannerStateName, type SignalVerdict } from "../types";

function notImplemented(state: ScannerStateName): SignalVerdict {
  return {
    status: "notImplemented",
    state,
    reason: `${SCANNER_STATE_META[state].label} has no deterministic v1 specification yet — see docs/SIGNAL_REGIME_ENGINE.md.`,
  };
}

export function evaluateTrendBreakout(): SignalVerdict {
  return notImplemented("trendBreakout");
}

export function evaluateConfirmedReversal(): SignalVerdict {
  return notImplemented("confirmedReversal");
}

export function evaluateRangeReversion(): SignalVerdict {
  return notImplemented("rangeReversion");
}
