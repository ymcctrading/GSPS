/**
 * `event_risk_pass` — "No Novice new entry ahead of earnings/defined binary
 * events in hold window. Unknown data defaults to block/caution."
 *
 * A thin, purpose-named wrapper around the same tri-state read
 * `lib/signals/disqualifiers.ts`'s `binaryEventInHoldPeriod` gate already
 * uses (`true`/`false`/`null`), so the two engines agree on what "unknown"
 * means without importing one from the other — this one is about universe
 * membership, that one is a scanner-state disqualifier, and they read the
 * same event calendar independently by design (see
 * `docs/MARKET_UNIVERSE_DATA_QUALITY.md`).
 */

import type { TriState, UniverseFilterResult } from "./types";

/** `true` = a binary event falls inside the expected Novice hold window. `"unknown"` blocks, same as `false` does not. */
export function eventRiskPass(binaryEventInHoldWindow: TriState): UniverseFilterResult {
  if (binaryEventInHoldWindow === "unknown") {
    return {
      key: "event_risk_pass",
      pass: false,
      reason: "Event calendar status is unknown for the expected hold window — defaults to block.",
    };
  }
  if (binaryEventInHoldWindow === true) {
    return {
      key: "event_risk_pass",
      pass: false,
      reason: "Earnings or another defined binary event falls inside the expected Novice hold window.",
    };
  }
  return { key: "event_risk_pass", pass: true, reason: null };
}
