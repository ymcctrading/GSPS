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
  | "disqualifier"
  /**
   * A new criterion under evaluation, not one of `CRITERION_KEYS` — see
   * `docs/PROPOSAL_NEW_GANN_CRITERIA.md`. Collected via
   * `ScanDecision.candidateCriteria` for attribution only; carries no points
   * and never affects `score` or `outputState`. Like `scoreHold`, exempt from
   * the automatic staleness check (no static source list to check it
   * against) — see `lib/validation/__tests__/criteria-gate.test.ts`.
   */
  | "candidate";

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
  | "unmeasured"
  /**
   * Scored once, no longer scored. Kept so historical payloads under
   * docs/replay-runs/ stay readable: they measured it, and a validity ledger
   * that forgets what it used to score cannot explain its own past. Exempt
   * from the completeness and stale-entry checks, and never gated on.
   */
  | "retired";

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
      "as the trade. 2026-09-09/10: six fresh live/Alpaca runs measured the new logic (docs/replay-runs/" +
      "2026-09-09-15Min-2R.json, -3R.json, -score5-6.json; 2026-09-10-15Min-2R-within-all.json, " +
      "-1Hour-2R.json, -1Hour-3R.json). Every Execute-bucket-conditioned run is too small on the failing " +
      "arm to read (16 trades at 15Min, 7 at 1Hour — both well under MIN_SAMPLES_PER_ARM). The one " +
      "population large enough on both arms — the unconditioned 15Min population, 491 passed / 538 " +
      "failed — reads +0.033; the 1Hour Execute bucket (91/31, also adequately sampled) reads −0.090. " +
      "Both are inside the ±0.1 noise band: no longer the clearly inverted counter-trend signal the old " +
      "logic measured, but not yet measuring positive either. Negligible, not validated — the fix ended " +
      "an active harm without (yet) establishing a benefit. Exits quarantine when a fresh committed run " +
      "measures it informative and positive, outside the noise band, on an adequately sampled arm, " +
      "twice.",
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
      "existing role-aware match runs. Two other live callers still spiraled from the stale Math.min() " +
      "anchor after that fix — lib/marketScan.ts's coarseReversion() pre-filter and lib/signals/" +
      "confluence/gann.ts's evaluateGannConfluence() — fixed 2026-09-10 the same way; neither sits on " +
      "the backtest replay path (lib/backtest/replay.ts never calls either), so this does not confound " +
      "the runs below, but it did mean the live scan's pre-filter and the Structural Coordinate " +
      "Confluence card were still reading a stale level while this criterion had already moved on. " +
      "2026-09-09/10: six fresh live/Alpaca runs measured the new " +
      "anchor (docs/replay-runs/2026-09-09-15Min-2R.json, -3R.json, -score5-6.json; " +
      "2026-09-10-15Min-2R-within-all.json, -1Hour-2R.json, -1Hour-3R.json). The Execute-bucket-" +
      "conditioned runs are too small on the failing arm to trust (13 passed / 3 failed at 15Min, " +
      "119/3 at 1Hour — both under MIN_SAMPLES_PER_ARM on one side, and a bucket the score itself " +
      "selected can't be read for saturation anyway). The unconditioned 15Min population — 660 passed " +
      "/ 369 failed, comfortably sampled both ways — reads −0.045: inside the ±0.1 noise band, not the " +
      "clear −0.29-to−0.13 inversion the old anchor measured, but not positive either. Negligible, not " +
      "validated. Exits quarantine when a fresh committed run measures it positive, outside the noise " +
      "band, on an adequately sampled arm, twice across different timeframes.",
  },
  {
    id: "historicalSR",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Historical support/resistance",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Strongest single result in the app on the one genuinely unconditioned population measured so " +
      "far: docs/replay-runs/2026-09-10-15Min-2R-within-all.json (1,029 trades, the clean full-universe " +
      "re-run replacing an earlier rate-limited capture) gives +0.344R delta, r=+0.09, t≈2.88 — " +
      "significant, in the declared direction, 188/1029 passing. Held at 'hypothesis' rather than " +
      "'validated' on purpose: the registry's own bar is two committed runs, and every earlier reading " +
      "(+0.56R, +1.50R on 2026-09-08) was inside an Execute-conditioned bucket — exactly the collider " +
      "this module's own sign-check guard now refuses to read a sign from, so it cannot count as a " +
      "second confirming run. Promotes to 'validated' on the next unconditioned capture that measures " +
      "it informative and positive again.",
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
    id: "stopRoom",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Stop room (>= 1.5x ATR)",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Replaced `momentum` on 2026-09-08. Momentum was the deadest criterion in the app: on 1,005 " +
      "unconditioned live trades it measured r=−0.0003, t=−0.01, Δ=−0.002R — three ten-thousandths " +
      "of a correlation, a point contributed for no information. It survives as an input to " +
      "applyReversionConfirmation's bare-2-2 gate, which is a different job; it is simply no longer " +
      "scored. Corroborated on the fresher, larger 2026-09-10 unconditioned run (1,029 trades): still " +
      "r≈0.00 (100/1029 passing, Δ=+0.002R) — dead on a second, independent population too.\n" +
      "\n" +
      "Stop room is the strongest effect in that same 2026-09-08 run and the reason for the swap: split " +
      "at 1.5x ATR it is +0.217R against −0.072R, Δ=+0.289R at t=2.40, with a 40.0% win rate against a " +
      "33.3% break-even. Larger than historicalSR, the best of the nine it joins. Expectancy is " +
      "monotonic across the boundary and 1.5x is the only point where the sign flips.\n" +
      "\n" +
      "The same split direction and shape reproduces on the fresher 2026-09-10 run (1,029 trades, " +
      "docs/replay-runs/2026-09-10-15Min-2R-within-all.json's atrBands): below 1.5x ATR, 854 trades at " +
      "31.2% win rate; at/above 1.5x, 175 trades at 38.3% — the same side of the 33.3% break-even line " +
      "flips the same way. That table only carries per-band win rate and mean expectancy, not per-trade " +
      "values, so no independent t-statistic is reported for it — the t=2.40 above is the one on record, " +
      "from real per-trade data.\n" +
      "\n" +
      "Stays hypothesis. The `?productionStop=1` run was captured 2026-09-09 and confirmed nothing, " +
      "because it turned out not to be a different measurement: every ATR band came back with " +
      "identical trade counts and identical win rates, four of five with a literally zero expectancy " +
      "difference, and the overall expectancy moved by 2e-6. computeStopWithLeeway takes whichever " +
      "stop is FURTHER from entry (levels.ts `Math.min(structuralStop, leewayCandidate)`), the " +
      "large-cap leeway is 0.25x ATR, and this sample has zero trades under 0.5x ATR — so the " +
      "leeway cannot bind on any trade, and only the 3.5x cap moved a handful in the 2.5x+ band.\n" +
      "\n" +
      "So the stop-width effect is measured on two overlapping-universe samples (same six large caps, " +
      "different windows), not yet a genuinely independent one. What it needs is a different WINDOW or " +
      "universe. Until then: reversion-only, 15Min. See MIN_STOP_ROOM_ATR for why this is a selection " +
      "rule and never an instruction to widen a stop.",
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
      "~108-dates-per-symbol coverage down to the top-quartile anchors only. 2026-09-09/10: six fresh " +
      "live/Alpaca runs measured the new logic (docs/replay-runs/2026-09-09-15Min-2R.json, -3R.json, " +
      "-score5-6.json; 2026-09-10-15Min-2R-within-all.json, -1Hour-2R.json, -1Hour-3R.json). The " +
      "Execute-bucket-conditioned runs are too small on the failing arm to trust (9 passed / 7 failed " +
      "at 15Min; 8/114 at 1Hour — under MIN_SAMPLES_PER_ARM on one side each time). The unconditioned " +
      "15Min population — 305 passed / 724 failed, comfortably sampled both ways — reads −0.031: " +
      "inside the ±0.1 noise band, no longer the clearly inverted −0.30 the old, undirected/unfiltered " +
      "logic measured, but not positive either. Negligible, not validated — the fix ended an active " +
      "harm without (yet) establishing a benefit. Exits quarantine when a fresh committed run measures " +
      "it informative and positive, outside the noise band, on an adequately sampled arm.",
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

/** Scored in the past, kept for the historical record. See `EvidenceStatus`. */
const RETIRED: RegisteredCriterion[] = [
  {
    id: "momentum",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-08)",
    label: "Momentum / volatility elevated",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `stopRoom`. On 1,005 unconditioned live trades it measured r=−0.0003, t=−0.01, " +
      "Δ=−0.002R: three ten-thousandths of a correlation, contributing a point of the nine for no " +
      "information at all. Every payload committed before 2026-09-08 measured it, which is why the " +
      "entry stays. `momentumElevated` itself is still computed and still gates the bare-2-2 check " +
      "in applyReversionConfirmation — that job was never the scored point.",
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

/**
 * New criteria under evaluation per docs/PROPOSAL_NEW_GANN_CRITERIA.md.
 * Collected via `ScanDecision.candidateCriteria`, not `breakdown` — see that
 * field's doc comment in lib/types.ts for why. None of these are one of
 * `CRITERION_KEYS`; they carry no points and cannot move `score` or
 * `outputState`. A candidate is promoted into `CRITERION_KEYS` only after
 * clearing the same in/out-of-sample validation bar
 * `lib/backtest/propose-weights.ts` already enforces for the existing nine —
 * see that proposal doc's "Validation discipline" section.
 */
const CANDIDATES: RegisteredCriterion[] = [
  {
    id: "gannAngleTrendHolding",
    family: "candidate",
    source: "lib/scoring/score.ts (candidateCriteria), lib/gann/normalizedSlope.ts",
    label: "Structural angle (1x1) trend-holding (candidate)",
    expectedSign: "positive",
    evidence: "unmeasured",
    note:
      "The classic 1x1 structural-angle rule: the trend is structurally intact only while price holds " +
      "at or beyond its own 1x1 angle since the anchor pivot (most recent significant low for a bullish setup, high " +
      "for bearish — the same anchor rule fanProximity's fan lines and the fixed harmonicProximity " +
      "already use). Wraps lib/gann/normalizedSlope.ts, which existed only as display/confluence " +
      "context (lib/signals/confluence/gann.ts's angleSlope field) before this. Needs a real replay run " +
      "to even read its pass rate for the first time — no payload has ever measured it.",
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
  ...RETIRED,
  ...SCORE_HOLDS,
  ...CANDIDATES,
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
