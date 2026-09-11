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
    id: "swingChartTrend",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/gann/swingChart.ts",
    label: "3-day/9-day swing chart trend",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Replaces `macroTrend` (retired 2026-09-10; see RETIRED) — its monthly/weekly/daily 2-of-3 " +
      "agreement measured negligible (inside the ±0.1R noise band on both adequately sampled arms) " +
      "after its counter-trend premise was already corrected once, on 2026-09-09. The 3-day and 9-day " +
      "swing charts (lib/gann/swingChart.ts#computeSwingChart) read the same daily bars through a " +
      "different construction — a fixed-count reversal run instead of a moving-average/pivot read — and " +
      "require both the 3-day and 9-day swing to agree with the trade's own direction, not merely with " +
      "each other. First measured 2026-09-10: Execute itself read 0/1049 triggered trades on this " +
      "universe at 15Min (both 2R and 3R) and 0/11371 at 1Hour (both 2R and 3R) — the four criteria " +
      "replaced the same day (see adxTrendStrength/timePriceSquare/volumeClimax below) are collectively " +
      "stricter, and no Execute-conditioned attribution exists yet at either timeframe. The unconditioned " +
      "population — the only one saturation can be read from — passed 305/1049 (29%) " +
      "(docs/replay-runs/2026-09-10-15Min-2R-within-all.json): Δ E[R] +0.082R, correlation +0.027, " +
      "t≈0.86 — well under lib/validation/health.ts's significance bar (|t|>=1.96), so correctly " +
      "signed but negligible rather than validated. The thin " +
      "score-5-6 near-miss band (27 trades, docs/replay-runs/2026-09-10-15Min-2R-score5-6.json) read the " +
      "opposite sign (−0.171) but was `insufficient` (failing arm n=7, under MIN_SAMPLES_PER_ARM=10) — " +
      "resolved as noise by the larger sample, a clean illustration of why a thin split can't be trusted " +
      "on its own.\n" +
      "\n" +
      "1Hour unconditioned population, captured as the cross-timeframe follow-up " +
      "(docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 observed — 10x the 15Min sample): " +
      "3081/10472 passed (29%, essentially identical pass rate to 15Min): Δ E[R] +0.032R, correlation " +
      "+0.010, t≈1.04 — still under the significance bar, still negligible, but the SAME sign as 15Min " +
      "this time. Two independent populations, same direction, neither individually significant — the " +
      "most consistent of the four new criteria so far, but 'consistent negligible' is still not " +
      "'validated'. Needs an effect that actually clears |t|>=1.96 on some population before this can " +
      "move past hypothesis; the direction agreement across timeframes is a mild positive sign but not " +
      "itself sufficient.",
  },
  {
    id: "adxTrendStrength",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/signals/indicators.ts",
    label: "1-hour trend strength (ADX/DMI)",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "15Min unconditioned population (2026-09-10, docs/replay-runs/2026-09-10-15Min-2R-within-all.json, " +
      "1049 trades): 292 passed (28%), correlation −0.065, t≈−2.09 — clears " +
      "lib/validation/health.ts's significance bar (|r|·√(n-3)≥1.96, not the flat ±0.1 cutoff the " +
      "RETIRED entries below describe — superseded because it misjudges significance across sample " +
      "sizes, see MIN_SIGNIFICANCE_T's comment), a real, significant inversion against the declared " +
      "positive sign.\n" +
      "\n" +
      "1Hour unconditioned population, captured as the direct follow-up (2026-09-10, " +
      "docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 observed trades — over 10x the " +
      "15Min sample): 2645 passed (25%), correlation +0.0069, t≈0.70 — not significant, and the sign " +
      "flipped positive. The inversion did NOT replicate on a much larger, independent population.\n" +
      "\n" +
      "This is the same shape BACKTESTING.md's masterStructural entry describes for a sign that " +
      "disagreed between timeframes: 'the disqualifying case propose-weights.ts calls disagreed... left " +
      "alone' rather than acted on either way. Structurally, though, this criterion cannot mechanically " +
      "return to `hypothesis`: docs/replay-runs/2026-09-10-15Min-2R-within-all.json stays committed (this " +
      "project does not delete or overwrite historical payloads — they are the evidentiary record), and " +
      "criteria-gate.test.ts re-audits every committed payload against the CURRENT registry on every " +
      "run. As long as that payload sits in the repo, lib/validation/health.ts's checkSign will keep " +
      "reporting its −2.09 as a significant inversion — un-quarantining would re-fail the same payload's " +
      "audit forever, not just today. So the disagreement argues the 15Min reading is plausibly a " +
      "regime/timeframe artifact rather than a real defect (matching masterStructural's precedent), but " +
      "the registry's own mechanics keep this quarantined regardless of that judgment.\n" +
      "\n" +
      "Exit condition, revised: no single additional run can lift this the way the original exit " +
      "condition assumed, because the 15Min payload's significant reading is now permanent evidence in " +
      "the repo. Lifting this needs either a maintainer's explicit call that the 15Min run is " +
      "non-representative (e.g. a `--since` window matched to the 1Hour run's period, isolating regime " +
      "from timeframe the way BACKTESTING.md's 'What would settle it' section describes for exactly this " +
      "kind of disagreement), or a preponderance of further non-inverted runs strong enough to outweigh " +
      "one committed inversion — a threshold this project has not formalized. Until then: real signal on " +
      "one population, absent on a ten-times-larger one: don't treat as either validated or confirmed-bad." +
      "\n\n" +
      "Mitigated 2026-09-11: still scored (not retired — the evidence above doesn't clear the bar for " +
      "that, only for distrust), but held at MIN_WEIGHT (0.5, down from 1) in " +
      "lib/scoring/weights.ts's DEFAULT_CRITERION_WEIGHTS, so a single significant inversion on one " +
      "population no longer carries the same weight as the seven criteria with no adverse finding " +
      "against them. Revert to 1 (or lift the quarantine) once the `--since`-windowed tie-breaking run " +
      "this entry describes actually settles the disagreement.",
    note:
      "Replaces `hourlyTrend` (retired 2026-09-10; see RETIRED) — its own leniency (an ambiguous " +
      "\"sideways\" hourly read counted as agreement) never cleared the sample floor as anything more " +
      "than hypothesis. Reuses lib/signals/indicators.ts's adx() and the 20-ADX trend-strength " +
      "threshold lib/signals/regime.ts already validated for the Signal & Regime Engine's own " +
      "\"which indicator confirms a trend\" question, rather than re-deriving a new one — per AGENTS.md's " +
      "cross-platform consistency principle. Stricter than hourlyTrend: both ADX >= 20 (trend " +
      "established) and +DI/-DI direction agreement with the setup are required, no lenient " +
      "ambiguous-still-passes branch. See quarantineReason for the 2026-09-10 measurement that put this " +
      "under quarantine on its first real run.",
  },
  {
    id: "gannAngleSlope",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Structural trend-angle strength (1x1)",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "Confirmed starved on two independent unconditioned populations. 15Min " +
      "(docs/replay-runs/2026-09-10-15Min-2R-within-all.json): 23/1049 passed (2.2%). 1Hour, captured " +
      "as the direct follow-up (docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 observed — " +
      "10x the 15Min sample): 200/10472 passed (1.9%) — if anything slightly worse. Both well under the " +
      "5% floor (DEFAULT_SATURATION_BOUNDS, lib/validation/health.ts) at samples far above " +
      "MIN_OBSERVATIONS_FOR_SATURATION (30); not a small-sample fluke on either timeframe. A criterion " +
      "this rarely true contributes its point on almost no setup — the same saturated defect this file " +
      "exists to catch, at the opposite end from the usual near-constant case.\n" +
      "\n" +
      "The 1Hour run also adds a second, independent finding: correlation −0.023, t≈−2.36 — a " +
      "significant inversion against the declared positive sign (the 15Min reading, +0.0056, t≈0.18, " +
      "was not significant either way). So this criterion is now confirmed starved on two populations " +
      "AND significantly inverted on one of them — strictly more evidence against it than " +
      "adxTrendStrength has, which is quarantined on a single-population inversion alone.\n" +
      "\n" +
      "`gannAngleSlope` replaced `fanProximity` on 2026-09-09; these are the first two unconditioned " +
      "populations captured since. Given two independent, large-sample confirmations of the same defect, " +
      "this is past the point where a third run is the obvious next step. Exit condition, revised: " +
      "lifting this needs a design change, not another measurement — requiring the realized slope to be " +
      "AT OR STEEPER than the literal 1x1 ratio (nearestAngle.ratio >= 1 in lib/scoring/score.ts) is " +
      "confirmed too strict a bar for this universe on both timeframes tried. Recommend either loosening " +
      "the ratio threshold and re-measuring, or treating this the way `momentum`/`macroTrend`/`timeCycle` " +
      "/`harmonicProximity` were eventually treated — as a candidate for retirement — rather than leaving " +
      "it quarantined indefinitely waiting for a result two large, independent samples have already given." +
      "\n\n" +
      "Mitigated 2026-09-11, pending that call: held at MIN_WEIGHT (0.5, down from 1) in " +
      "lib/scoring/weights.ts's DEFAULT_CRITERION_WEIGHTS rather than retired outright — retiring without " +
      "a replacement would drop TOTAL_POINTS to eight and silently move the Execute/Watch cutoffs' real " +
      "meaning, which this fix deliberately does not do. This is explicitly interim: the registry's own " +
      "recommendation above is retirement (with a replacement criterion, per this file's own established " +
      "practice), not a permanent down-weight. Revert to 1 only alongside loosening the 1x1 ratio " +
      "threshold and re-measuring — nothing in the evidence above supports simply restoring the weight.",
    note:
      "Replaces `fanProximity` (retired 2026-09-10; see RETIRED). Wraps lib/gann/normalizedSlope.ts's " +
      "realized ATR-per-bar slope since the direction-matched swing anchor, judged against the 1x1 " +
      "angle ratio — a literal angle-of-ascent/descent check, unlike the generic fan-line-distance " +
      "proximity it replaces. See quarantineReason for the 2026-09-10 saturation findings (15Min and " +
      "1Hour, both confirming).",
  },
  {
    id: "volumeClimax",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/gann/volumeClimax.ts",
    label: "Volume climax at the anchor pivot",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Replaces `harmonicProximity` (retired 2026-09-10; see RETIRED) — its key-price-level-proximity " +
      "approach measured negligible even after fixing its stale-anchor defect twice. This is a " +
      "genuinely different signal off the same direction-matched anchor (the same pivot detection " +
      "`gannAngleSlope`/`timePriceSquare` use, not a new anchor rule): whether that pivot itself " +
      "printed on unusually heavy volume, reusing lib/signals/indicators.ts's relativeVolume() and the " +
      "same >1.5x 'unusual volume' threshold lib/signals/regime.ts already validated for its own " +
      "accepted-breakout check, per AGENTS.md's cross-platform consistency principle — rather than " +
      "another price-distance check. Also replaces the key-price-level proximity term in " +
      "lib/marketScan.ts's coarseReversion() pre-filter with the same volume-climax check, so the " +
      "coarse gate still tracks the criterion it is meant to approximate. First measured 2026-09-10: " +
      "Execute itself read 0 trades at every timeframe/targetR tried, so only unconditioned attribution " +
      "exists. The 15Min unconditioned population (docs/replay-runs/2026-09-10-15Min-2R-within-all.json) " +
      "passed only 60/1049 (6%) — the rarest of the four new criteria in this population: Δ E[R] " +
      "+0.109R, correlation +0.018, t≈0.58 — correctly signed but nowhere near " +
      "lib/validation/health.ts's significance bar (|t|>=1.96), so negligible. The thin " +
      "score-5-6 band (27 trades, docs/replay-runs/2026-09-10-15Min-2R-score5-6.json) is the one case " +
      "among the four where the near-miss sample also cleared MIN_SAMPLES_PER_ARM on both arms " +
      "(11 passed / 16 failed) and read `informative` there too: Δ E[R] +0.336R, correlation +0.121 — " +
      "consistent direction, larger effect, but a single higher reading from a 27-trade band doesn't " +
      "override the 1049-trade unconditioned read.\n" +
      "\n" +
      "1Hour unconditioned population, captured as the cross-timeframe follow-up " +
      "(docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 observed): 2036/10472 passed (19% — " +
      "notably higher pass rate than 15Min's 6%, worth noting though not itself diagnostic): Δ E[R] " +
      "+0.014R, correlation +0.0038, t≈0.39 — same sign as every reading so far (15Min unconditioned, " +
      "15Min score5-6, and now 1Hour unconditioned all read positive), but still well under the " +
      "significance bar. Three consistent-direction readings across two timeframes and a near-miss band " +
      "is the strongest directional consistency of the four new criteria, but none individually " +
      "significant — stays hypothesis until one population actually clears |t|>=1.96.",
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
    id: "timePriceSquare",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/gann/timePriceSquare.ts",
    label: "Price and time squared",
    expectedSign: "positive",
    evidence: "hypothesis",
    note:
      "Replaces `timeCycle` (retired 2026-09-10; see RETIRED) — its projected-anniversary-date " +
      "approach measured negligible even after fixing the two implementation defects that had made it " +
      "look inverted. This is a different construction on the same daily bars: bars elapsed since the " +
      "direction-matched swing pivot (low for bullish, high for bearish — the same anchor convention " +
      "`gannAngleSlope` uses) checked one-for-one against the raw price move since that pivot, with no " +
      "ATR normalization — a distinct question from `gannAngleSlope`'s ATR-normalized rate of change. " +
      "First measured 2026-09-10: Execute itself read 0 trades at every timeframe/targetR tried, so only " +
      "unconditioned attribution exists. The 15Min unconditioned population " +
      "(docs/replay-runs/2026-09-10-15Min-2R-within-all.json) passed 117/1049 (11%): Δ E[R] −0.270R, " +
      "correlation −0.060, t≈−1.96 — the wrong sign versus the declared positive expectation, but " +
      "landing right at lib/validation/health.ts's significance threshold (|t|>=1.96) rather than past " +
      "it, so this reads negligible rather than inverted — the single closest call of the four new " +
      "criteria to flipping status on a marginally different sample. Before " +
      "this run existed, the raw-dollar-price-move-vs-bar-count construction (no ATR normalization, " +
      "unlike every proximity criterion this codebase already fixed to compare in ATR-relative terms) " +
      "looked like a candidate to be saturated false outright for this higher-priced universe (SPY/AAPL/" +
      "AMD/TSLA/MSFT/NVDA, mostly $150-900) versus the ~$100-scale instrument the unit test " +
      "(lib/gann/__tests__/timePriceSquare.test.ts) exercises it against — that hypothesis did not hold: " +
      "it passes a real, non-trivial 11% of the time. The thin score-5-6 band (27 trades) read the " +
      "OPPOSITE sign (+0.105, `insufficient`, passing arm n=5) from the unconditioned population — sign " +
      "instability between a thin split and a large one is itself consistent with a true effect near " +
      "zero, not two disagreeing measurements.\n" +
      "\n" +
      "1Hour unconditioned population, captured as the cross-timeframe follow-up " +
      "(docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 observed): 1398/10472 passed (13%, " +
      "similar rate to 15Min's 11%): Δ E[R] +0.088R, correlation +0.021, t≈2.15 — this CLEARS " +
      "lib/validation/health.ts's significance bar (|t|>=1.96), in the declared positive direction. On " +
      "its own this is `status: ok` — a genuine, significant, correctly-signed result, the first any of " +
      "the four new criteria has produced.\n" +
      "\n" +
      "Not promoted to `validated` despite that, because the registry's bar is agreement across more " +
      "than one run, and the 15Min unconditioned reading pointed the other way (−0.060, non-significant " +
      "but still negative). This is the same 'sign disagreed between timeframes' shape BACKTESTING.md " +
      "documents for masterStructural — one real positive reading and one non-significant negative one " +
      "is not two agreeing confirmations, even though the positive one individually clears significance. " +
      "Unlike adxTrendStrength/gannAngleSlope, nothing here forces quarantine (the disagreeing 15Min " +
      "reading was never itself significant, so it never produced an `inverted` finding) — this stays " +
      "`hypothesis`, one real result and one contradicting near-zero result, needing a tie-breaking run " +
      "(a third population, or the `--since`-windowed timeframe/regime split BACKTESTING.md's 'What " +
      "would settle it' section describes) before it can move either direction.",
  },
  {
    id: "gannRetracementConfluence",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Retracement + signal-flow confluence",
    expectedSign: "positive",
    evidence: "unmeasured",
    note:
      "Replaces `masterStructural` (retired 2026-09-10; see RETIRED). A composite: passes only when a " +
      "percentage-retracement zone (lib/gann/retracement.ts, the genuinely new structural mechanism this " +
      "codebase was missing) matches in the trade's role AND the price-time signal-flow confluence off " +
      "the same anchor (lib/gann/digitalRoot.ts's priceTimeConfluence) is not NO_CONFLUENCE. The AND is " +
      "deliberate, not incidental: blueprint 7.4's safety rule forbids that signal-flow reading from " +
      "ever gating a verdict by itself, so it is wired in only as a confirming second factor on top of " +
      "an independent structural check, never as the sole basis for the point. Never scored before; " +
      "needs a fresh committed replay before any sign claim.",
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
  {
    id: "fanProximity",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-10)",
    label: "Support/resistance line proximity",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `gannAngleSlope`. Alongside `masterStructural`, one of the three dead criteria: " +
      "Δ=−0.002R, r=−0.0003, t=−0.01, 10.0% pass rate — statistically indistinguishable from noise " +
      "(t well under 2), the same t=−0.01 already on record for `momentum` above. Earlier readings " +
      "(+0.31R, +1.20R on 2026-09-08) were both below the per-arm sample floor and never confirmed on a " +
      "larger population. Replaced with a literal angle-of-ascent/descent check rather than a " +
      "re-tuned proximity band.",
  },
  {
    id: "masterStructural",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-10)",
    label: "Final target confirmed by a structural level",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `gannRetracementConfluence`. One of the three dead criteria: Δ=+0.052R, r=+0.019, " +
      "t=0.59, 54.4% pass rate — the sign is positive but t=0.59 clears no significance bar, consistent " +
      "with the sign disagreement between timeframes already on record here (−0.56R at 15Min vs +1.00R " +
      "at 1Hour, 2026-09-08) and with docs/BACKTESTING.md's note that 1Hour has historically inverted " +
      "the scoring model's own verdict ranking — see lib/timeframe.ts's EXECUTION_TIMEFRAME override for " +
      "why any 1Hour-influenced reading here needs discounting until real-time data lands. Replaced with " +
      "a composite retracement-zone + signal-flow confluence check rather than a re-tuned target rule.",
  },
  {
    id: "hourlyTrend",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-10)",
    label: "1-hour trend agreement",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `adxTrendStrength`. Positive on both 2026-09-08 runs (+0.89R, +1.00R), but the " +
      "failing arm was 1 trade in each — direction agreed, sample never carried it past hypothesis. " +
      "Its own pass rule was lenient (an ambiguous \"sideways\" hourly read counted as agreement), which " +
      "is plausibly why the failing arm was always so thin. Replaced with a stricter ADX/DMI " +
      "trend-strength-and-direction test rather than a re-tuned trend-agreement rule.",
  },
  {
    id: "macroTrend",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-10)",
    label: "Macro trend context (10yr/5yr/1yr)",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `swingChartTrend`. Originally scored a reversion on the macro running AGAINST the " +
      "trade (the counter-trend-snapback premise); that premise measured negative on both runs of " +
      "2026-09-08 (−0.17R at 15Min, −1.42R at 1Hour) and was corrected 2026-09-09 to score trend " +
      "agreement for both setup kinds instead. 2026-09-09/10: six fresh live/Alpaca runs measured the " +
      "corrected logic (docs/replay-runs/2026-09-09-15Min-2R.json, -3R.json, -score5-6.json; " +
      "2026-09-10-15Min-2R-within-all.json, -1Hour-2R.json, -1Hour-3R.json). Every Execute-bucket-" +
      "conditioned run was too small on the failing arm to read (16 trades at 15Min, 7 at 1Hour — both " +
      "well under MIN_SAMPLES_PER_ARM). The one population large enough on both arms — the unconditioned " +
      "15Min population, 491 passed / 538 failed — read +0.033; the 1Hour Execute bucket (91/31, also " +
      "adequately sampled) read −0.090. Both inside the ±0.1 noise band: no longer the clearly inverted " +
      "counter-trend signal the old logic measured, but never established a benefit either — negligible, " +
      "not validated, even after the active-harm fix. Replaced with a different construction on the same " +
      "daily bars (the 3-day/9-day swing charts) rather than a third attempt at tuning a " +
      "monthly/weekly/daily agreement rule.",
  },
  {
    id: "timeCycle",
    family: "scanScore",
    source: "lib/gann/timeCycles.ts (scored until 2026-09-10)",
    label: "Cyclical turn window active",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `timePriceSquare`. Measured informative and inverted at 15Min on 2026-09-08 " +
      "(−0.83R, correlation −0.30), constant at 1Hour (13/13). Three implementation defects fixed " +
      "2026-09-09: (1) the 'top quartile by prominence' anchor filter the old code claimed in a " +
      "comment but never ran — it took the last 12 pivots by chronological index, not by prominence " +
      "— is now real (lib/analysis/pivots.ts's majorPivots(), ranked by swing distance to the nearest " +
      "opposite-kind pivot); (2) no directional check, so a projected turn argued for a bullish and a " +
      "bearish setup identically — timeCycles() now tags each date by its anchor's kind (low anchors " +
      "bullish, high anchors bearish) and returned bullishActive/bearishActive separately, matched " +
      "against the setup's own direction instead of either; (3) both fixes together also cut the " +
      "near-total ~108-dates-per-symbol coverage down to the top-quartile anchors only. 2026-09-09/10: " +
      "six fresh live/Alpaca runs measured the new logic (docs/replay-runs/2026-09-09-15Min-2R.json, " +
      "-3R.json, -score5-6.json; 2026-09-10-15Min-2R-within-all.json, -1Hour-2R.json, -1Hour-3R.json). " +
      "The Execute-bucket-conditioned runs were too small on the failing arm to trust (9 passed / 7 " +
      "failed at 15Min; 8/114 at 1Hour — under MIN_SAMPLES_PER_ARM on one side each time). The " +
      "unconditioned 15Min population — 305 passed / 724 failed, comfortably sampled both ways — read " +
      "−0.031: inside the ±0.1 noise band, no longer the clearly inverted −0.30 the old, " +
      "undirected/unfiltered logic measured, but never positive either — negligible, not validated, " +
      "even after the active-harm fix. `timeCycleActive`/`timeCycleBullishActive`/" +
      "`timeCycleBearishActive` are still computed and still drive the display-only turn-window " +
      "callouts on the ticker and chart pages — only the scored point moved. Replaced with a different " +
      "construction on the same daily bars (squaring price and time against the swing pivot rather " +
      "than projecting anniversary dates) rather than a third attempt at tuning an anniversary-date rule.",
  },
  {
    id: "harmonicProximity",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-10)",
    label: "Key price level proximity",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Replaced by `volumeClimax`. −0.134 on 2026-08-12-1Hour-3R (both arms above the attribution " +
      "floor), sign also flipping between timeframes on 2026-09-08. docs/BACKTESTING.md attributed " +
      "the instability to role-blindness, and the 2026-08-27 role-aware match fix (score.ts's " +
      "wantedRole filter) verifiably did not end it — because role-blindness wasn't the only defect. " +
      "lib/gann/squareOf9.ts spiraled every level from Math.min() of the whole daily window — the " +
      "single lowest low over the lookback, however stale, used identically for bullish and bearish " +
      "setups alike — rather than the pivot that actually anchors the current move; a stale/irrelevant " +
      "anchor, distinct from the role-matching bug already fixed. 2026-09-09: replaced with " +
      "recentSquareOf9Levels(), which anchors from the most recent significant high AND low (the same " +
      "'anchor from the two most recent pivots' rule lib/gann/fans.ts already used for the stable " +
      "fanProximity sibling), merged before the existing role-aware match runs. Two other live callers " +
      "still spiraled from the stale Math.min() anchor after that fix — lib/marketScan.ts's " +
      "coarseReversion() pre-filter and lib/signals/confluence/gann.ts's evaluateGannConfluence() — " +
      "fixed 2026-09-10 the same way; neither sits on the backtest replay path (lib/backtest/replay.ts " +
      "never calls either), so this did not confound the runs below, but it did mean the live scan's " +
      "pre-filter and the Structural Coordinate Confluence card were still reading a stale level while " +
      "this criterion had already moved on. 2026-09-09/10: six fresh live/Alpaca runs measured the new " +
      "anchor (docs/replay-runs/2026-09-09-15Min-2R.json, -3R.json, -score5-6.json; " +
      "2026-09-10-15Min-2R-within-all.json, -1Hour-2R.json, -1Hour-3R.json). The Execute-bucket-" +
      "conditioned runs were too small on the failing arm to trust (13 passed / 3 failed at 15Min, " +
      "119/3 at 1Hour — both under MIN_SAMPLES_PER_ARM on one side, and a bucket the score itself " +
      "selected can't be read for saturation anyway). The unconditioned 15Min population — 660 passed " +
      "/ 369 failed, comfortably sampled both ways — read −0.045: inside the ±0.1 noise band, not the " +
      "clear −0.29-to−0.13 inversion the old anchor measured, but never positive either — negligible, " +
      "not validated, even after two anchor fixes. lib/marketScan.ts's coarseReversion() pre-filter now " +
      "reads volumeClimax's anchor/threshold instead, so the coarse gate keeps tracking whichever " +
      "criterion it approximates. Replaced with a different signal off the same anchor (volume climax) " +
      "rather than a third attempt at tuning a price-proximity band.",
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
  ...RETIRED,
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
