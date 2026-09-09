/**
 * Every pass/fail gate in the app that influences whether a trade is shown,
 * scored, or taken — declared in one place, with the sign each one is expected
 * to have and the evidence actually backing it.
 *
 * This exists because of a specific failure. Every audit this codebase has had
 * asked "does the code do what it says?" — a *correctness* question, which all
 * of the criteria below pass. None asked "does what the code does correlate
 * with making money?" — a *validity* question, which several of them fail.
 * `lib/backtest/attribution.ts` could have answered the second question at any
 * point; nothing ever required anyone to ask it, so a criterion could be
 * inverted or saturated for months without a single check going red.
 *
 * The registry closes that by making three things mechanical rather than
 * remembered:
 *
 *   - **Completeness.** `lib/validation/__tests__/criteria-gate.test.ts`
 *     cross-checks this list against the source of truth for each family. A
 *     criterion added to the scan, a state's Rules Alignment breakdown, or the
 *     disqualifier list without a matching entry here fails the build. You
 *     cannot ship a new gate without declaring what you expect it to do.
 *   - **Sign.** `expectedSign` records the direction the criterion is *claimed*
 *     to work in. Measured evidence that contradicts it fails the build unless
 *     the entry is explicitly `quarantined`.
 *   - **Saturation.** A criterion that is true for nearly every setup carries
 *     no information while still contributing its point — it silently lowers
 *     the threshold it is supposed to defend. See `lib/validation/health.ts`.
 *
 * `evidence` is deliberately pessimistic. "unmeasured" is the honest default
 * and most of this file carries it: two of the three families below have never
 * had a single outcome measured against them, and saying so in code is the
 * point. Promoting an entry to "validated" requires a committed replay payload
 * that measured it informative, in the declared direction, more than once.
 */

import { CRITERION_KEYS, type CriterionKey } from "@/lib/scoring/weights";

/** Which subsystem owns the gate. Each family has its own source of truth. */
export type CriterionFamily =
  /** The nine scored criteria — `lib/scoring/score.ts`, weighted, summed to a verdict. */
  | "scanScore"
  /** Post-score explanations that hold a verdict down. No points, but they change the output state. */
  | "scoreHold"
  /** Rules Alignment components inside a signal state — `lib/signals/states/*`. */
  | "rulesAlignment"
  /** Pre-trade blocks — `lib/signals/disqualifiers.ts`. */
  | "disqualifier";

/**
 * The direction the criterion claims to work in, stated as the sign of the
 * correlation between the criterion being **true** and the trade's realised R.
 *
 * "unknown" is not a shrug — it marks a gate whose effect cannot be read off
 * outcome attribution at all (see `disqualifier` below), so a sign check would
 * be measuring nothing.
 */
export type ExpectedSign = "positive" | "negative" | "unknown";

export type EvidenceStatus =
  /** Measured informative, in the declared direction, on more than one committed run. */
  | "validated"
  /** A declared expectation. Either unmeasured at the sample floor, or measured but unstable. */
  | "hypothesis"
  /** Measured *against* its declared sign. Known-bad, deliberately not blocking — see `quarantineReason`. */
  | "quarantined"
  /** No outcome has ever been measured against this criterion. */
  | "unmeasured";

export interface RegisteredCriterion {
  /** Stable id. Namespaced by state for `rulesAlignment`, where keys repeat across states. */
  id: string;
  family: CriterionFamily;
  /** Module that owns it, so a finding points at the code rather than the id. */
  source: string;
  label: string;
  expectedSign: ExpectedSign;
  evidence: EvidenceStatus;
  /**
   * Required when `evidence` is "quarantined": what was measured, and what
   * would settle it. A quarantine without a stated exit is how a known defect
   * becomes permanent.
   */
  quarantineReason?: string;
  /** Free-text provenance — measurement notes, instability, structural caveats. */
  note?: string;
  /**
   * Per-criterion saturation override. Set only where a criterion is expected
   * to be near-constant for a structural reason, with that reason in `note`.
   */
  saturation?: { minPassRate: number; maxPassRate: number };
}

/** The nine scored criteria. Every one is claimed to help when it passes. */
const SCAN_SCORE: RegisteredCriterion[] = [
  {
    id: "macroTrend",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Macro trend context (10yr/5yr/1yr)",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "Measured negative on both runs of 2026-09-08 (−0.17R at 15Min, −1.42R at 1Hour) under the old " +
      "counter-trend premise (a reversion wanted the macro running AGAINST the trade). That premise " +
      "was a strategy question, not a code defect, and was settled 2026-09-09: computeScore now scores " +
      "trend agreement for both setup kinds instead — macro timeframes should read the same direction " +
      "as the trade. Carried under quarantine rather than promoted straight to 'hypothesis', because " +
      "the prior committed payloads describe the old logic's outcomes, not this one's — they cannot " +
      "vindicate or condemn the new rule either way. Exits quarantine when a fresh committed run, under " +
      "the new logic, measures it informative and positive twice.",
  },
  {
    id: "hourlyTrend",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "1-hour trend agreement",
    expectedSign: "positive",
    evidence: "hypothesis",
    note: "Positive on both 2026-09-08 runs (+0.89R, +1.00R), but the failing arm was 1 trade in each — direction agrees, sample does not carry it.",
  },
  {
    id: "fanProximity",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Support line proximity",
    expectedSign: "positive",
    evidence: "hypothesis",
    note: "Positive on both 2026-09-08 runs (+0.31R, +1.20R); both below the per-arm floor.",
  },
  {
    id: "harmonicProximity",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Key price level proximity",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "−0.134 on 2026-08-12-1Hour-3R (both arms above the attribution floor), sign also flipping " +
      "between timeframes on 2026-09-08. docs/BACKTESTING.md attributed the instability to " +
      "role-blindness, and the 2026-08-27 role-aware match fix (score.ts's wantedRole filter) " +
      "verifiably did not end it — because role-blindness wasn't the only defect. lib/gann/squareOf9.ts " +
      "spiraled every level from Math.min() of the whole daily window — the single lowest low over the " +
      "lookback, however stale, used identically for bullish and bearish setups alike — rather than the " +
      "pivot that actually anchors the current move; a stale/irrelevant anchor, distinct from the " +
      "role-matching bug already fixed. 2026-09-09: replaced with recentSquareOf9Levels(), which anchors " +
      "from the most recent significant high AND low (the same 'anchor from the two most recent pivots' " +
      "rule lib/gann/fans.ts already used for the stable fanProximity sibling), merged before the " +
      "existing role-aware match runs. Carried under quarantine rather than promoted straight to " +
      "'hypothesis': the committed payloads above measured the old anchor, not this one, so they cannot " +
      "vindicate or condemn it either way. Exits quarantine when a fresh committed run measures it " +
      "positive, outside the noise band, twice across different timeframes.",
  },
  {
    id: "historicalSR",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Historical support/resistance",
    expectedSign: "positive",
    evidence: "hypothesis",
    note: "Positive on both 2026-09-08 runs (+0.56R, +1.50R) — the most consistent of the nine, still below the per-arm floor.",
  },
  {
    id: "patternArmed",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Pattern armed",
    expectedSign: "positive",
    evidence: "unmeasured",
    note:
      "Constant by construction inside any triggered sample — a trade cannot exist without an armed " +
      "pattern — so a bucket-conditioned run can never measure it. Only an unconditioned population " +
      "(armed setups that did and did not trigger) can.",
    saturation: { minPassRate: 0, maxPassRate: 1 },
  },
  {
    id: "momentum",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Momentum / volatility elevated",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "The only criterion to clear the sample floor in the declared direction (+0.30R, informative, " +
      "15Min 2026-09-08) — but it inverts at 1Hour (−1.43R) on a sample too small to trust. Unstable, not validated.",
  },
  {
    id: "timeCycle",
    family: "scanScore",
    source: "lib/gann/timeCycles.ts",
    label: "Cyclical turn window active",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "Measured informative and inverted at 15Min on 2026-09-08 (−0.83R, correlation −0.30), constant " +
      "at 1Hour (13/13). Three implementation defects fixed 2026-09-09: (1) the 'top quartile by " +
      "prominence' anchor filter the old code claimed in a comment but never ran — it took the last 12 " +
      "pivots by chronological index, not by prominence — is now real (lib/analysis/pivots.ts's " +
      "majorPivots(), ranked by swing distance to the nearest opposite-kind pivot); (2) no directional " +
      "check, so a projected turn argued for a bullish and a bearish setup identically — timeCycles() " +
      "now tags each date by its anchor's kind (low anchors bullish, high anchors bearish) and returns " +
      "bullishActive/bearishActive separately, and computeScore matches the criterion against the " +
      "setup's own direction instead of either; (3) both fixes together also cut the near-total " +
      "~108-dates-per-symbol coverage down to the top-quartile anchors only. Carried under quarantine " +
      "rather than promoted straight to 'hypothesis': the committed payload above measured the old, " +
      "undirected, unfiltered logic, not this one, so it cannot vindicate or condemn the fix either way. " +
      "Exits quarantine when a fresh committed run measures it informative and positive.",
  },
  {
    id: "masterStructural",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Final target confirmed by structure",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Sign disagrees between timeframes (−0.56R at 15Min, +1.00R at 1Hour, 2026-09-08), reproducing " +
      "the disagreement docs/BACKTESTING.md already records for this criterion and deliberately left alone.",
  },
];

/**
 * Checks appended after scoring to explain a held verdict. They carry no
 * points, so they cannot be re-weighted — but each one can still change the
 * output state, which makes them worth declaring.
 */
const SCORE_HOLDS: RegisteredCriterion[] = [
  {
    id: "tradePlanPriced",
    family: "scoreHold",
    source: "lib/scoring/score.ts",
    label: "Trade plan priced (entry / stop / TP1 / master)",
    expectedSign: "unknown",
    evidence: "unmeasured",
    note: "Appended only when a 7+ score has no priced plan, so it is absent from most trades and cannot be read as a fail elsewhere.",
  },
  {
    id: "reversionConfirmation",
    family: "scoreHold",
    source: "lib/scoring/score.ts",
    label: "Bare reversal confirmation",
    expectedSign: "unknown",
    evidence: "unmeasured",
  },
  {
    id: "dataLag",
    family: "scoreHold",
    source: "lib/data/latency.ts",
    label: "Decision-lag hold",
    expectedSign: "unknown",
    evidence: "unmeasured",
    note:
      "Holds Execute to Watch when the feed is a whole execution bar or more behind. On the free IEX " +
      "feed (15 min) against the 15Min execution timeframe the ratio is exactly 1.0, so this fires for " +
      "every US equity whenever the market is open — the reason no Execute verdict has ever reached " +
      "the live monitor pipeline. Structural, not a scoring defect; see docs/BACKTESTING.md.",
  },
];

const ALIGNMENT_STATES: Record<string, string[]> = {
  trendPullback: [
    "higherTimeframeDirection",
    "approvedPullbackLocation",
    "structuralIntegrity",
    "confirmationClose",
    "liquiditySpread",
    "benchmarkSector",
    "volumeResumption",
    "noBinaryEventConflict",
    "targetStopFeasibility",
  ],
  trendBreakout: [
    "priorTrendContext",
    "validatedBase",
    "structuralIntegrity",
    "confirmationClose",
    "liquiditySpread",
    "benchmarkSector",
    "volumeExpansion",
    "noBinaryEventConflict",
    "targetStopFeasibility",
  ],
  confirmedReversal: [
    "exhaustionAtMeaningfulLevel",
    "structuralBreak",
    "structuralIntegrity",
    "confirmationHold",
    "liquiditySpread",
    "benchmarkSector",
    "volumeConfirmation",
    "noBinaryEventConflict",
    "targetStopFeasibility",
  ],
  rangeReversion: [
    "verifiedRange",
    "atBoundaryNotMidpoint",
    "structuralIntegrity",
    "rejectionConfirmation",
    "liquiditySpread",
    "benchmarkSector",
    "noBreakoutVolumeSpike",
    "noBinaryEventConflict",
    "targetStopFeasibility",
  ],
};

/**
 * Rules Alignment components, namespaced by state because five of the nine keys
 * repeat across all four states with different implementations behind them.
 *
 * Every one is "unmeasured": the replay attributes the nine *scored* criteria,
 * never these, so the 100-point alignment score that gates `tradeable` has
 * never had a single component checked against an outcome. That is the largest
 * unvalidated surface in the app and the reason this family is registered at
 * all — an unmeasured gate should be a visible gap, not an invisible one.
 */
const RULES_ALIGNMENT: RegisteredCriterion[] = Object.entries(ALIGNMENT_STATES).flatMap(
  ([state, keys]) =>
    keys.map((key) => ({
      id: `${state}.${key}`,
      family: "rulesAlignment" as const,
      source: `lib/signals/states/${state}.ts`,
      label: `${state}: ${key}`,
      expectedSign: "positive" as const,
      evidence: "unmeasured" as const,
    })),
);

/**
 * Pre-trade blocks.
 *
 * `expectedSign` is "unknown" for all of them for a structural reason worth
 * stating plainly: **a gate cannot be measured from the trades it let through.**
 * A disqualifier that fires prevents the trade, so the blocked setup has no
 * realised R to correlate against, and outcome attribution is blind to it by
 * construction. Measuring these needs a counterfactual the app does not record
 * — a shadow mode that walks what blocked setups *would* have done. Until that
 * exists, every one of these is an untested assumption, and the honest thing is
 * to say so here rather than let the silence read as confidence.
 */
const DISQUALIFIERS: RegisteredCriterion[] = [
  "unclosedCandle",
  "staleData",
  "binaryEvent",
  "targetBlocked",
  "stopPolicy",
  "positionSize",
  "correlationConcentration",
  "cooldown",
  "totalOpenRisk",
  "dataQuality",
  "eligibleUniverse",
].map((key) => ({
  id: key,
  family: "disqualifier" as const,
  source: "lib/signals/disqualifiers.ts",
  label: `Disqualifier: ${key}`,
  expectedSign: "unknown" as const,
  evidence: "unmeasured" as const,
  note: "Blocked setups have no outcome; needs counterfactual shadow measurement, which does not exist yet.",
}));

export const CRITERIA_REGISTRY: RegisteredCriterion[] = [
  ...SCAN_SCORE,
  ...SCORE_HOLDS,
  ...RULES_ALIGNMENT,
  ...DISQUALIFIERS,
];

export function findCriterion(id: string): RegisteredCriterion | undefined {
  return CRITERIA_REGISTRY.find((c) => c.id === id);
}

export function criteriaByFamily(family: CriterionFamily): RegisteredCriterion[] {
  return CRITERIA_REGISTRY.filter((c) => c.family === family);
}

/**
 * The scored-criteria half of the completeness check, done against the type
 * system rather than a source scan: `CRITERION_KEYS` is the scan's own source
 * of truth, so a tenth criterion added there is caught here.
 */
export const REGISTERED_SCAN_SCORE_KEYS: readonly CriterionKey[] = CRITERION_KEYS;
