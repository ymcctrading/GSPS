/**
 * The publishable half of a Signal and Regime Engine verdict — same rule as
 * `lib/scoring/public-summary.ts`: the full breakdown (which named criterion
 * passed on which condition) stays server-side. What crosses an API/UI
 * boundary is a rollup: which regime, which direction, which readiness tier.
 * A reader learns the setup's regime and how it's rated; nothing about which
 * MA/VWAP/structural conditions decided it.
 */

import type { Regime, RulesAlignmentTier, ScannerStateName, SignalVerdict } from "./types";
import type { Direction, ScanResult } from "@/lib/types";

export interface PublicSignalSummary {
  state: ScannerStateName;
  regime: Regime;
  direction: Exclude<Direction, "none"> | "sideways";
  tier: RulesAlignmentTier;
  tradeable: boolean;
  /** See `SignalVerdict`'s `accountContextAssumed` — false means this reading has real account gates behind it. */
  accountContextAssumed: boolean;
}

function toSummary(verdict: SignalVerdict): PublicSignalSummary {
  if (verdict.status !== "evaluated") {
    throw new Error("toSummary called on a non-evaluated verdict");
  }
  return {
    state: verdict.state,
    regime: verdict.regime.regime,
    direction: verdict.regime.direction,
    tier: verdict.alignment.tier,
    tradeable: verdict.tradeable,
    accountContextAssumed: verdict.accountContextAssumed,
  };
}

const TIER_RANK: Record<RulesAlignmentTier, number> = {
  watchlistOnly: 0,
  qualified: 1,
  aTier: 2,
  aPlusTier: 3,
};

/**
 * Picks the strongest rollup across every state a scan evaluated — tradeable
 * outranks not-tradeable, then higher tier wins. `null`/`undefined` and
 * non-evaluated verdicts (disqualified, not implemented) are skipped rather
 * than surfaced, since there's nothing publishable about either.
 */
export function toPublicSignalSummary(
  ...verdicts: (SignalVerdict | null | undefined)[]
): PublicSignalSummary | null {
  const evaluated = verdicts.filter(
    (v): v is Extract<SignalVerdict, { status: "evaluated" }> => v != null && v.status === "evaluated",
  );
  if (evaluated.length === 0) return null;

  const best = evaluated.reduce((a, b) => {
    if (a.tradeable !== b.tradeable) return a.tradeable ? a : b;
    return TIER_RANK[a.alignment.tier] >= TIER_RANK[b.alignment.tier] ? a : b;
  });
  return toSummary(best);
}

/**
 * Strips a verdict down to what's safe to serialize across an API boundary —
 * same rule as `lib/scoring/public-summary.ts`'s `redactDecision`. The
 * per-criterion breakdown (which named condition passed on which computed
 * value — e.g. "Relative volume 1.32x confirms...") and the regime's own
 * `reasons`/`disqualifiers` text (which name specific internal thresholds,
 * e.g. "ADX >= 20") stay server-side. `score`/`tier`/`tradeable`/`plan` are
 * the rollup a reader needs; a disqualified/notImplemented verdict already
 * carries no per-criterion breakdown, so it passes through unchanged.
 */
export function redactSignalVerdict(verdict: SignalVerdict | null): SignalVerdict | null {
  if (!verdict) return null;
  if (verdict.status !== "evaluated") return verdict;
  return {
    ...verdict,
    regime: { ...verdict.regime, reasons: [], disqualifiers: [] },
    alignment: { ...verdict.alignment, breakdown: [] },
  };
}

/** The same, for every state a scan evaluated. */
export function redactScanSignals(signals: ScanResult["signals"]): ScanResult["signals"] {
  if (!signals) return signals;
  return {
    regime: { ...signals.regime, reasons: [], disqualifiers: [] },
    trendPullback: redactSignalVerdict(signals.trendPullback),
    trendBreakout: redactSignalVerdict(signals.trendBreakout),
    confirmedReversal: redactSignalVerdict(signals.confirmedReversal),
    rangeReversion: redactSignalVerdict(signals.rangeReversion),
  };
}
