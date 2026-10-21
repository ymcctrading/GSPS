/**
 * The publishable half of a Signal and Regime Engine verdict — same rule as
 * `lib/scoring/public-summary.ts`: the full breakdown (which named criterion
 * passed on which condition) stays server-side. What crosses an API/UI
 * boundary is a rollup: which regime, which direction, which readiness tier.
 * A reader learns the setup's regime and how it's rated; nothing about which
 * structural conditions decided it.
 */

import type { Regime, RulesAlignmentTier, ScannerStateName, SignalVerdict } from "./types";
import type { Direction, ScanResult } from "@/lib/types";
import type { GannConfluenceResult, SaraConfluenceResult } from "./confluence/types";
import { EMPTY_DISCLOSED_RULES } from "@/lib/gann/disclosedRulesEmpty";
import type { DisclosedRulesContext } from "@/lib/gann/disclosedRules";

export interface PublicSignalSummary {
  state: ScannerStateName;
  regime: Regime;
  direction: Exclude<Direction, "none"> | "sideways";
  tier: RulesAlignmentTier;
  /**
   * The Rules Alignment score, 0–100 — the same figure the Trade Reviews card
   * shows for a closed plan and `redactScanResult` already lets across the API
   * boundary as `alignment.score`. Optional because a row persisted before
   * 2026-09-30 carries the tier alone. The setup cards (`lib/setups/card.ts`)
   * show it when present.
   */
  alignmentScore?: number;
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
    alignmentScore: verdict.alignment.score,
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
    // The engine's own plan (an entry a cent past the last bar, a target at
    // the nearest cluster or 2R) is not Gann's: the Gann plan is the only plan
    // a person is shown (review finding R-025, 2026-10-21).
    plan: null,
  };
}

/**
 * The Gann/Sara confluence modules carry the same kind of internal-threshold
 * explanation trace `redactSignalVerdict` strips from a state's breakdown —
 * strip it here too, keeping the alignment/scenario/coordinate rollup a
 * reader needs.
 */
function redactGannConfluence(result: GannConfluenceResult | null): GannConfluenceResult | null {
  if (!result) return result;
  return {
    ...result,
    // The Square of Nine root, the vortex and slope readings, the coordinate
    // ledger and the dated time-count lists are the method's working: no
    // screen draws them (the card reads only the counts' active flags), and
    // the dates have no measured record (R-024).
    root: null,
    timeCycleDates: [],
    timeCycleFixedCalendarDates: [],
    squareOf52: { ...result.squareOf52, dates: [] },
    angleMonthCounts: { ...result.angleMonthCounts, dates: [] },
    vortexContext: { priceDisplacement: null, timeDisplacement: null, priceVortexClass: null, timeVortexClass: null, relationship: null, transition: null },
    angleSlope: null,
    coordinateLedger: [],
    // A fan line's time target is a dated forward label with no measured record (R-024).
    nearestFanLine: result.nearestFanLine ? { ...result.nearestFanLine, timeProjectionDate: null } : null,
    disclosedRules: redactDisclosedRules(result.disclosedRules),
    evidence: { ...result.evidence, inputs: {}, explanationTrace: [] },
  };
}

/**
 * The readings the confluence card draws (`components/scan/confluence-card.tsx`,
 * `DisclosedRuleTiles`). Every other reading stays on the server: the
 * astrology and Jensen readings, the time counts and grids no tile shows, and
 * the dated forward labels (the next change date and the swing projection),
 * which have no measured record ("Forward-looking claims"; review finding
 * R-024, 2026-10-21). A key added here is a reading sent to the browser.
 */
const CARD_RULE_KEYS = [
  "accumulation",
  "barMidpoint",
  "campaign",
  "circle",
  "counterMove",
  "cycleRangeBreak",
  "dayCircle",
  "dayCountBands",
  "extremes",
  "firstRally",
  "leadership",
  "levelTests",
  "masterCalculator",
  "multipleTops",
  "planetary",
  "pricePercentages",
  "ruleOfThree",
  "seasonal",
  "sharesPerPoint",
  "squareOfNineTime",
  "timeAngle",
  "timeRules",
  "yearFraction",
  "zone",
] as const satisfies readonly (keyof DisclosedRulesContext)[];

export function redactDisclosedRules(rules: DisclosedRulesContext | undefined): DisclosedRulesContext {
  if (!rules) return EMPTY_DISCLOSED_RULES;
  const out: DisclosedRulesContext = { ...EMPTY_DISCLOSED_RULES, asOf: rules.asOf };
  const write = out as unknown as Record<string, unknown>;
  for (const key of CARD_RULE_KEYS) write[key] = rules[key];
  out.timing = { alternation: rules.timing?.alternation ?? null, square144: rules.timing?.square144 ?? null, projection: null, changeDates: null };
  return out;
}

function redactSaraConfluence(result: SaraConfluenceResult | null): SaraConfluenceResult | null {
  if (!result) return result;
  return { ...result, evidence: { ...result.evidence, inputs: {}, explanationTrace: [] } };
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
    gannConfluence: redactGannConfluence(signals.gannConfluence),
    saraConfluence: redactSaraConfluence(signals.saraConfluence),
  };
}
