/**
 * Range Reversion does not yet have a deterministic v1 specification — the
 * source spec ("GSPS Signal and Regime Engine", Aug 28 2026) gives the
 * shared regime table and scoring/disqualifier framework for all four
 * states, but only writes out entry/stop/target logic for the bullish
 * pullback case. Trend Breakout and Confirmed Reversal have since been
 * given engineering-authored v1 specs (`lib/signals/states/trendBreakout.ts`,
 * `lib/signals/states/confirmedReversal.ts`), explicitly labeled as such
 * since neither is spec-pack-sourced either — the same option remains open
 * for this one.
 *
 * Rather than invent numeric entry/stop/target rules with no documented
 * basis and no clear standard technique to lean on the way breakout and
 * failure-swing-reversal methodology provide — which would fabricate
 * exactly the kind of undocumented rule this doctrine-driven engine exists
 * to avoid — it stays wired into the same architecture (its own module, its
 * own `ScannerStateMeta`, isolated from the other three) but returns
 * `notImplemented` until a v1 spec lands for it. See
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

export function evaluateRangeReversion(): SignalVerdict {
  return notImplemented("rangeReversion");
}
