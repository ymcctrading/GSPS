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
      "this time.\n" +
      "\n" +
      "A third reading landed 2026-09-11, back on 15Min (docs/replay-runs/2026-09-11-15Min-2R-within-" +
      "all.json, 1061 trades): 309/1061 passed (29%, same pass rate a third time): Δ+0.105R, r=+0.034, " +
      "t≈1.10 — still negligible, still positive. Three readings, three positive signs, none " +
      "significant — the most consistent of the four new criteria so far, but 'consistent negligible' " +
      "is still not 'validated'. Needs an effect that actually clears |t|>=1.96 on some population " +
      "before this can move past hypothesis.",
  },
  {
    id: "gannAngleSlope",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Structural trend-angle strength (1x2+)",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "Confirmed starved on two independent unconditioned populations under the ORIGINAL (ratio >= 1, " +
      "\"1x1 or steeper\") threshold. 15Min (docs/replay-runs/2026-09-10-15Min-2R-within-all.json): " +
      "23/1049 passed (2.2%). 1Hour (docs/replay-runs/2026-09-10-1Hour-2R-within-all.json, 10472 " +
      "observed — 10x the 15Min sample): 200/10472 passed (1.9%). Both well under the 5% floor " +
      "(DEFAULT_SATURATION_BOUNDS, lib/validation/health.ts) at samples far above " +
      "MIN_OBSERVATIONS_FOR_SATURATION (30). The 1Hour run also measured a significant inversion " +
      "(correlation −0.023, t≈−2.36) against the declared positive sign.\n" +
      "\n" +
      "**2026-09-11: acted on rather than re-measured a third time.** `lib/scoring/score.ts`'s " +
      "`angleHolding` now accepts `nearestAngle.ratio >= 0.5` (1x2-or-steeper) instead of `>= 1` " +
      "(1x1-or-steeper) — ANGLES (lib/gann/fans.ts) already defines the full ladder down to 1x2 " +
      "(ratio 0.5); requiring the single steepest rung had no measured justification, and two " +
      "independent large-sample confirmations of the same starvation-plus-inversion defect were judged " +
      "enough to act on without a third run repeating the same measurement against the same broken " +
      "threshold.\n" +
      "\n" +
      "**Still quarantined, not yet unmeasured or lifted.** Both committed payloads above measured the " +
      "OLD (ratio >= 1) logic — `lib/validation/health.ts`'s audit checks by criterion id against " +
      "whatever the CURRENT registry says, regardless of which code version produced a payload, so " +
      "those two committed readings will keep reporting starved/inverted findings for `gannAngleSlope` " +
      "forever. Only `quarantined` (or `retired`) downgrades that to a warning; `unmeasured` would " +
      "reopen the same build-breaking error this file exists to prevent, for evidence that is now " +
      "stale. Exit condition: a fresh replay under the new `>= 0.5` threshold — this changes what the " +
      "criterion measures, so it needs its own first reading, not a continuation of the old one.\n" +
      "\n" +
      "**2026-09-11: first reading of the new threshold, and it looks like the fix worked.** " +
      "docs/replay-runs/2026-09-11-15Min-2R-within-all.json (1061 trades, the same day the loosening " +
      "shipped): 216/1061 passed (20%) — comfortably clear of the 5% starvation floor, up nearly " +
      "10x from the old threshold's 2.2%. Correlation −0.044, t≈−1.43 — negative still, but nowhere " +
      "near lib/validation/health.ts's significance bar, so this reads `negligible`, not `inverted`. " +
      "That is exactly what the exit condition above asked for: saturation cleared, sign not inverted. " +
      "By the letter of that condition this could move to `hypothesis` now.\n" +
      "\n" +
      "**Stays quarantined anyway, and will keep failing the letter of its own exit condition " +
      "indefinitely** — verified directly rather than assumed: setting evidence to `hypothesis` and " +
      "running criteria-gate.test.ts immediately re-fails on both committed 2026-09-10 payloads " +
      "(15Min: starved 2.2%; 1Hour: starved 1.9% AND sign-inverted t≈−2.36), because both still carry " +
      "the OLD (ratio>=1) measurement and the audit checks the CURRENT registry against every committed " +
      "payload regardless of which code version produced it. This is the same structural bind " +
      "documented on adxTrendStrength: a fix that changes what a criterion measures can produce a " +
      "clean new reading while historical evidence of the old, broken version remains permanently in " +
      "the repo. The tag stays `quarantined` as a registry-mechanics artifact, not as a live concern — " +
      "the fix is working. Genuine unblocking needs either a maintainer's explicit judgment call that " +
      "the two 2026-09-10 payloads describe a superseded implementation and should not gate the current " +
      "one, or a second confirming reading under the new threshold (ideally 1Hour, still uncaptured for " +
      "this criterion) strong enough that a future maintainer treats the old readings as historical " +
      "rather than live.",
    note:
      "Replaces `fanProximity` (retired 2026-09-10; see RETIRED). Wraps lib/gann/normalizedSlope.ts's " +
      "realized ATR-per-bar slope since the direction-matched swing anchor, judged against a fixed " +
      "structural angle ratio — a literal angle-of-ascent/descent check, unlike the generic " +
      "fan-line-distance proximity it replaces. Loosened 2026-09-11 from requiring 1x1-or-steeper to " +
      "1x2-or-steeper; see " +
      "quarantineReason for the 2026-09-10 saturation findings that drove the change and why the " +
      "criterion stays quarantined pending a fresh reading of the new threshold.",
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
      "+0.014R, correlation +0.0038, t≈0.39 — same sign as every reading so far.\n" +
      "\n" +
      "A fourth reading landed 2026-09-11, back on 15Min (docs/replay-runs/2026-09-11-15Min-2R-within-" +
      "all.json, 1061 trades): 60/1061 passed (6%, identical pass rate to the first 15Min run): " +
      "Δ+0.111R, r=+0.018, t≈0.59 — still positive, still nowhere near significant. Four consistent-" +
      "direction readings across two timeframes and a near-miss band is the strongest directional " +
      "consistency of the four new criteria, but none individually significant — stays hypothesis " +
      "until one population actually clears |t|>=1.96.\n" +
      "\n" +
      "`VOLUME_CLIMAX_THRESHOLD` was loosened 1.5x → 1.25x relative volume on 2026-09-14 as part of the " +
      "AGENTS.md 'Execute collapse stopgap' (lib/gann/volumeClimax.ts) — intended to widen a criterion " +
      "that was rare (6%) but positively signed into a more common one without losing the sign. Two " +
      "fresh unconditioned readings against the loosened threshold: 15Min " +
      "(docs/replay-runs/2026-09-14-15Min-2R-within-all.json, 985 trades) passed 168/985 (17% — well " +
      "above the ~10-12% expected from the threshold math, and nearly 3x the pre-loosening 6%): Δ E[R] " +
      "−0.0018R, correlation −0.0005, t≈−0.02 — the sign flipped negative and the effect collapsed to " +
      "indistinguishable from zero. 1Hour (docs/replay-runs/2026-09-14-1Hour-2R-within-all.json, 10480 " +
      "observed) passed 3301/10480 (31.5% — over 10x the pre-loosening 19%): Δ E[R] +0.0044R, " +
      "correlation +0.0014, t≈0.15 — sign held positive but the effect is now negligible to the point " +
      "of carrying no information, down from the pre-loosening +0.014R/t≈0.39 on a similarly-sized " +
      "1Hour sample. Both readings agree on one thing the stopgap did not intend: the wider band did " +
      "not just admit more of the same signal, it diluted it toward noise.\n" +
      "\n" +
      "**2026-09-14, follow-up: reverted the threshold, widened the anchor pool instead.** " +
      "`VOLUME_CLIMAX_THRESHOLD` moved back to 1.5x (the `lib/signals/regime.ts`-matched value) and " +
      "`computeVolumeClimax` (lib/gann/volumeClimax.ts) now checks the last `RECENT_PIVOTS_CHECKED` " +
      "(3) pivots of the anchor's kind for climax volume, not only the single most recent one — " +
      "`anchorPrice`/`anchorKind` still always name the single latest pivot, matching " +
      "`gannAngleSlope`/`timePriceSquare`'s shared anchor convention exactly, so this doesn't desync " +
      "the direction-matched anchor the way giving this criterion its own lower `findPivots` strength " +
      "would have. This targets the actual starvation mechanism (too few candidate anchors ever " +
      "cleared 1.5x) instead of loosening the bar every candidate is judged against, which is what " +
      "diluted the signal above. Not yet measured — needs its own fresh committed run before any sign " +
      "claim; the 6%/17%/31.5% pass rates and the deltas throughout this entry all describe prior code " +
      "versions, none of them this one.",
  },
  {
    id: "historicalSR",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Historical support/resistance",
    expectedSign: "positive",
    evidence: "validated",
    note:
      "Strongest, most consistent result in the app across every unconditioned population measured. " +
      "2026-09-10 (docs/replay-runs/2026-09-10-15Min-2R-within-all.json, 1049 trades): 193/1049 passed, " +
      "Δ+0.387R, r=+0.107, t≈3.42 — significant, in the declared direction. 2026-09-11, a fresh capture " +
      "on the same universe one day later (docs/replay-runs/2026-09-11-15Min-2R-within-all.json, 1061 " +
      "trades): 196/1061 passed, Δ+0.368R, r=+0.101, t≈3.30 — significant, same direction, same rough " +
      "magnitude, both arms comfortably above MIN_SAMPLES_PER_ARM. Every earlier reading before these " +
      "two (+0.56R, +1.50R on 2026-09-08) was inside an Execute-conditioned bucket — exactly the " +
      "collider this module's own sign-check guard refuses to read a sign from, so those never counted. " +
      "These two do: both unconditioned, both informative, both significant, both positive. Promoted " +
      "from hypothesis to validated on the second confirming run, per this file's own stated bar.",
  },
  {
    id: "entryTriggerArmed",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/gann/entryTrigger.ts",
    label: "Entry trigger armed (old-level crossing)",
    expectedSign: "positive",
    evidence: "unmeasured",
    note:
      "Renamed from `patternArmed` and regrounded 2026-09-17, closing the last gate-1 failure on " +
      "this scorecard. The criterion was never the problem — 'is there an armed trigger to enter " +
      "on?' is a real question — but its implementation read a bar-sequence pattern from Rob " +
      "Smith's STRAT, which has no source in this platform's methodology. It now reads " +
      "lib/gann/entryTrigger.ts: crossing an old swing top or bottom plus the 'lost motion' " +
      "allowance, both disclosed in docs/GANN_HISTORICAL_SOURCES.md A8 (the nine Buying Points " +
      "and nine Selling Points, and the Resistance Level method). Renamed rather than retired, so " +
      "CRITERION_KEYS.length and both cutoffs are unchanged.\n\n" +
      "Still constant by construction inside any triggered sample — a trade cannot exist without " +
      "an armed trigger — so a bucket-conditioned run can never measure it. Only an unconditioned " +
      "population (armed setups that did and did not trigger) can. That limitation carried over " +
      "unchanged from the old implementation and is a property of what the criterion asks, not of " +
      "which rule answers it.\n\n" +
      "**Its prior measurements do not transfer.** Any attribution captured against `patternArmed` " +
      "measured a different rule on a different reference level (the prior BAR's extreme, not the " +
      "prior SWING's). Treat this as a fresh criterion for evidence purposes.",
    saturation: { minPassRate: 0, maxPassRate: 1 },
  },
  {
    id: "stopRoom",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Stop room (>= 1.5x ATR)",
    expectedSign: "positive",
    evidence: "quarantined",
    quarantineReason:
      "Both fresh runs captured 2026-09-14 (docs/replay-runs/2026-09-14-15Min-2R-within-all.json, 985 " +
      "trades; docs/replay-runs/2026-09-14-1Hour-2R-within-all.json, 10480 observed) measure this " +
      "saturated: 967/985 (98.2%) at 15Min, 10427/10480 (99.5%) at 1Hour — both far past " +
      "DEFAULT_SATURATION_BOUNDS' 95% ceiling, and the first committed evidence to reflect what this " +
      "criterion actually asks post-2026-09-11: for `us_equity` it no longer reads the ATR-multiple " +
      "question this entry's note below describes, it reads `levels.stopFromStructure` — whether the " +
      "stop anchored to a real nearby level instead of the fixed fallback percentage (score.ts's " +
      "`hasStopRoom`, lib/strat/levels.ts's `computeEquityTradeLevels`). No run existed against that " +
      "branch until now, so this is a genuinely new finding, not a re-measurement.\n" +
      "\n" +
      "Root cause traced, not guessed: `computeEquityTradeLevels`'s stop-anchoring acceptance band " +
      "(`nearestStructuralStop`, EQUITY_STOP_MIN_PCT=3 to EQUITY_STOP_MAX_PCT=15, 20 for large-cap) is a " +
      "wide, FIXED percentage-of-price band that accepts ANY level from the pooled set of structural " +
      "systems (clustered historical S/R, fan lines, `squareOf9.ts` key levels — 'a clustered historical " +
      "S/R level, a fan line, or a squareOf9 price are all real structure in the same sense,' per that " +
      "function's own comment). That is a much wider net than the `historicalSR` scoring criterion casts for its " +
      "own, unrelated 'is price near A level right now' question — SR_PROXIMITY_ATR=0.5, half a day's " +
      "ATR range, and only one level system. A stock with several structural levels scattered across " +
      "price will almost always have SOME level somewhere in the wide 3-20% band even when none sits " +
      "close enough to matter by the tighter ATR-relative standard the codebase already uses elsewhere " +
      "— which is exactly why this criterion's own comment ('true for the large majority of setups... " +
      "historicalSR passes on roughly 18-19%') guessed a rate that turned out wrong: it assumed the " +
      "same pool of near-price levels would produce a similar hit rate, when the acceptance band and " +
      "the level pool are both far wider here.\n" +
      "\n" +
      "Potential fixes, not yet chosen or implemented — the acceptance band drives real stop placement " +
      "as well as this score, so tightening it is a live-behavior change, not only a scoring one:\n" +
      "1. Narrow `nearestStructuralStop`'s band to be ATR-relative (mirroring SR_PROXIMITY_ATR) instead " +
      "of a fixed percentage — consistent with AGENTS.md's cross-platform principle, but changes where " +
      "real stops get placed, not only the score, and needs its own fresh run to size.\n" +
      "2. Decouple the scoring question from the placement band: keep the wide 3-20% net for deciding " +
      "where to actually anchor a stop (a legitimate reason to cast wide when placing risk), but score " +
      "a narrower, separate ATR-relative check as `hasStopRoom` instead of the placement band's own " +
      "`stopFromStructure` flag. Lower blast radius — no live stop placement changes — but still needs " +
      "a fresh run to confirm the narrower band doesn't just starve instead.\n" +
      "3. Retire/replace the criterion for `us_equity`, the same fate `momentum` had when the original " +
      "ATR-multiple version of this same criterion first measured dead in 2026-09-08 (see the note " +
      "below) — if a narrower band can't be found that both discriminates and matches real placement " +
      "logic, the provenance question ('was this anchored to structure') may simply not be a useful " +
      "*scored* criterion for the percent-of-price model, whatever it's worth for stop placement itself.\n" +
      "\n" +
      "Exit condition: whichever fix ships, plus a fresh committed run reading this criterion back " +
      "inside DEFAULT_SATURATION_BOUNDS (5%-95%) — not a code change alone, since the two payloads above " +
      "stay committed as the evidentiary record and criteria-gate.test.ts re-audits them against " +
      "whatever the registry currently says on every run, the same structural bind documented on " +
      "adxTrendStrength/gannAngleSlope above.\n" +
      "\n" +
      "Pre-2026-09-11 history below describes the ORIGINAL ATR-multiple version of this criterion, still " +
      "the live question for every asset class except `us_equity` — kept as the evidentiary record for " +
      "that branch, not a description of the equity saturation above.",
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
      "universe.\n" +
      "\n" +
      "A third same-universe reading landed 2026-09-11 (docs/replay-runs/2026-09-11-15Min-2R-within-" +
      "all.json, 1061 trades, one day's rolling window forward from the 2026-09-10 capture): 184/1061 " +
      "passed, Δ+0.252R, r=+0.068, t≈2.21 — significant this time, same direction, same rough " +
      "magnitude as the two before it. Reproduces cleanly a third time, but per the standard this entry " +
      "already set for itself, a one-day-later window on the identical six symbols is not the " +
      "genuinely independent sample the exit condition asks for — it's essentially the same population " +
      "plus a handful of new trades, not a different regime or universe. Reversion-only, 15Min. See " +
      "MIN_STOP_ROOM_ATR for why this is a selection rule and never an instruction to widen a stop.\n" +
      "\n" +
      "**2026-09-11 onward: the above describes an evidentiary record for a branch this criterion no " +
      "longer walks for equities.** The same day as the last reading above, `us_equity` moved to the " +
      "percent-of-purchase-price stop model (lib/strat/levels.ts's `computeEquityTradeLevels`) and this " +
      "criterion's equity question changed from 'stop width >= 1.5x ATR' to 'stop anchored to real " +
      "structure' (score.ts's `hasStopRoom`). Every reading above measured the ATR-multiple question, " +
      "which every non-equity asset class still asks — that history stays valid for them, but describes " +
      "nothing about the equity branch, which went unmeasured for three days until the 2026-09-14 runs " +
      "found it 98-99% saturated. See `quarantineReason` for that finding, its root cause, and the " +
      "candidate fixes.",
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
      "is not two agreeing confirmations, even though the positive one individually clears significance.\n" +
      "\n" +
      "A third reading landed 2026-09-11, back on 15Min (docs/replay-runs/2026-09-11-15Min-2R-within-" +
      "all.json, 1061 trades): 118/1061 passed (11%, same pass rate as the first 15Min run): " +
      "Δ−0.221R, r=−0.049, t≈−1.60 — negative again, closer to the earlier borderline −1.96 than to " +
      "zero, but still short of it. Two negative-but-not-quite-significant 15Min readings against one " +
      "significant positive 1Hour reading: the weight of evidence has not shifted toward resolving the " +
      "disagreement, if anything the 15Min side looks slightly more consistently negative with a second " +
      "data point. Unlike adxTrendStrength/gannAngleSlope, nothing here forces quarantine (neither 15Min " +
      "reading has itself been significant, so neither produced an `inverted` finding) — this stays " +
      "`hypothesis`, needing a tie-breaking run (a third *independent* population — not another same-" +
      "universe capture — or the `--since`-windowed timeframe/regime split BACKTESTING.md's 'What would " +
      "settle it' section describes) before it can move either direction.\n" +
      "\n" +
      "`SQUARE_TOLERANCE_BARS` was loosened 2 → 4 bars on 2026-09-14 as part of the AGENTS.md 'Execute " +
      "collapse stopgap' (lib/gann/timePriceSquare.ts) — the disagreement above (negative-leaning " +
      "15Min, significant-positive 1Hour) is exactly the shape the loosening was aimed at resolving, " +
      "not just widening pass rate. Two fresh unconditioned readings against the loosened tolerance: " +
      "15Min (docs/replay-runs/2026-09-14-15Min-2R-within-all.json, 985 trades) passed 240/985 (24% — " +
      "above the ~20% expected, roughly double the pre-loosening 11%): Δ E[R] +0.112R, correlation " +
      "+0.034, t≈1.07 — the sign FLIPPED from negative to positive, resolving the prior 15Min-vs-1Hour " +
      "disagreement in the direction the declared `expectedSign: positive` calls for, though still " +
      "short of significance. 1Hour (docs/replay-runs/2026-09-14-1Hour-2R-within-all.json, 10480 " +
      "observed) passed 2851/10480 (27%, up from the pre-loosening 13%): Δ E[R] +0.051R, correlation " +
      "+0.016, t≈1.62 — sign held positive but the effect weakened from the pre-loosening +0.088R/" +
      "t≈2.15 down below the significance bar it used to clear. Net effect of the loosening: both " +
      "timeframes now agree on sign for the first time (previously they disagreed), but neither clears " +
      "|t|>=1.96 any longer — the 1Hour reading traded a significant positive result for a merely " +
      "directionally-consistent one. That is progress on the cross-timeframe disagreement this entry " +
      "flagged as needing a tie-breaker, but it is not itself a validation: stays `hypothesis`, and a " +
      "future weight re-derivation should use these post-loosening deltas (+0.112R/+0.051R), not the " +
      "pre-loosening −0.221R this entry's earlier paragraphs describe — that reading no longer " +
      "describes the code as shipped.",
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
  {
    id: "ruleOfThree",
    family: "scanScore",
    source: "lib/scoring/score.ts, lib/gann/ruleOfThree.ts",
    label: "Rule of Three (consecutive closes confirm the direction)",
    expectedSign: "positive",
    evidence: "unmeasured",
    note:
      "Added 2026-09-16 per docs/GANN_PLATFORM_AUDIT.md Part 4 item 1 and AGENTS.md's standing " +
      "precedence-for-the-disclosed-methodology principle — a direct request to wire the source's own " +
      "highest-conviction disclosed rule " +
      "(`Wall Street Stock Selector`, 1930, docs/GANN_HISTORICAL_SOURCES.md A4: 'traders paid me $1,000 " +
      "for this rule') into the live scorer immediately, overriding this codebase's normal unmeasured " +
      "-> attribution -> in/out-of-sample discipline (PROPOSAL_NEW_GANN_CRITERIA.md) rather than " +
      "quarantining it as a hypothesis first. No replay has ever measured it — this entry exists so " +
      "that gap is visible, not hidden. The literal book rule is directional and asymmetric (an uptrend " +
      "needs 3 consecutive lower closes to signal reversal; a downtrend needs only 2 consecutive higher " +
      "closes) and is about a REVERSAL forming, not a trade's own direction generically — " +
      "lib/gann/ruleOfThree.ts's docblock states exactly how this criterion generalizes that to 'the " +
      "immediate closes support this trade's own direction' for both reversion and continuation setups, " +
      "which is a broader reading than the source's literal text. Needs a fresh committed replay before any " +
      "sign claim, same as every other never-scored criterion above — the override applies to whether " +
      "it scores live today, not to whether its evidence claim is settled.",
  },
];

/** Scored in the past, kept for the historical record. See `EvidenceStatus`. */
const RETIRED: RegisteredCriterion[] = [
  {
    id: "patternArmed",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-17), lib/strat/patterns.ts",
    label: "Pattern armed",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Retired 2026-09-17 — superseded in place by `entryTriggerArmed`, not deleted. It asked a " +
      "legitimate question ('is there an armed trigger to enter on?') and answered it with a " +
      "bar-sequence pattern from Rob Smith's STRAT, which has no source in this platform's " +
      "methodology. That made it the last gate-1 failure on the scorecard, and — more " +
      "consequentially than its single scored point — the source of every trade plan's entry " +
      "price and, through riskPerShare, every position size. See `entryTriggerArmed` for the " +
      "replacement and `lib/gann/entryTrigger.ts` for the rule.\n\n" +
      "**Kept here, retired rather than removed, so the committed runs in docs/replay-runs/ " +
      "still validate.** Every run captured before 2026-09-17 measured this criterion by this " +
      "name, and `criteria-gate.test.ts` fails any measured id it cannot find declared. Deleting " +
      "the entry would have made those runs unreadable rather than historical. Its numbers " +
      "describe the old rule on the old reference level (the prior BAR's extreme, not the prior " +
      "SWING's) and do not transfer to the replacement.",
  },
  {
    id: "adxTrendStrength",
    family: "scanScore",
    source: "lib/scoring/score.ts (scored until 2026-09-16), lib/signals/indicators.ts",
    label: "1-hour trend strength (ADX/DMI)",
    expectedSign: "positive",
    evidence: "retired",
    note:
      "Removed from the scorecard 2026-09-16 on the project owner's direct instruction, and " +
      "deliberately **not replaced with anything** — unlike every other entry in this list, which was " +
      "swapped for a successor criterion. The scored criteria went from ten back to nine; " +
      "EXECUTE_SCORE_THRESHOLD/WATCH_SCORE_THRESHOLD were rescaled 6.67/3.89 -> 6/3.5 to hold the same " +
      "relative bar (66.7%/38.9% of TOTAL_POINTS), and DEFAULT_CRITERION_WEIGHTS lost its 0.5 entry.\n" +
      "\n" +
      "**The reason is provenance, not the measurement — and the reason generalizes even though the " +
      "number does not.** adxTrendStrength was the one scored criterion with no lineage in the " +
      "platform's own founding methodology at all: Wilder's ADX/DMI (1978) postdates that " +
      "methodology's own historical source material by more than two decades (docs/" +
      "GANN_PLATFORM_AUDIT.md's Part 1 table classifies it GSPS-ORIGINAL for exactly this reason). It " +
      "entered this codebase in lib/signals/regime.ts, as the trend-confirmation overlay the Signal & " +
      "Regime Engine uses *instead of* leaning on a PSAR/Supertrend-style indicator alone (AGENTS.md's " +
      "cross-platform-consistency section cites it as the standing example), and reached the scorecard " +
      "by propagation from there rather than by any independent claim that it belonged in a setup " +
      "selected by that methodology's score. With no PSAR anywhere in this repo (docs/" +
      "GSPS_AUTOMATION.md confirms: zero matches repo-wide), the thing it substituted for does not " +
      "exist here, so there is nothing to keep substituting for.\n" +
      "\n" +
      "That settles a hypothesis raised while auditing the negative readings below: the -0.245R was " +
      "**not** a mistranslation of a founding-methodology rule into code, because there was no such " +
      "rule to mistranslate. A general-purpose trend filter measuring inverted against setups selected " +
      "by that methodology is the expected result, not a porting defect to hunt for. Generalize the " +
      "reason, not the number: when a criterion with no connection to that methodology measures " +
      "against its declared sign on this scorecard, ask first whether it was ever grounded in the " +
      "methodology the setups are selected by, before treating the inversion as a bug in the " +
      "implementation.\n" +
      "\n" +
      "**The indicator is not removed; only the scored criterion is.** lib/signals/indicators.ts's " +
      "adx() stays exported and stays in live use by lib/signals/regime.ts (classifyRegime's " +
      "trend-strength support) and lib/signals/states/rangeReversion.ts (its MAX_ADX_FOR_RANGE gate). " +
      "That is a deliberate call, not an oversight of AGENTS.md's cross-platform consistency principle: " +
      "the Signal & Regime Engine's spec genuinely asks a different question (is this market trending " +
      "or ranging, at all?) than this scorecard does (does an independent trend filter agree with a " +
      "setup this platform's core methodology selected?), which is the \"different governing spec\" " +
      "carve-out that section names. " +
      "ScoreInputs.hourlyAdx, score.ts's adxTrendHolding/ADX_TREND_THRESHOLD, and the adx() calls in " +
      "lib/scanTicker.ts and lib/backtest/replay.ts all went with the criterion.\n" +
      "\n" +
      "Measurement history, kept because every payload committed before 2026-09-16 measured this and a " +
      "validity ledger that forgets what it used to score cannot explain its own past. It replaced " +
      "`hourlyTrend` on 2026-09-10 (see that entry) with a stricter two-part test — ADX >= 20 AND " +
      "+DI/-DI agreeing with the setup's direction, no lenient ambiguous-still-passes branch — and was " +
      "quarantined on its first real run. 15Min unconditioned populations inverted significantly and " +
      "reproducibly: 2026-09-10-15Min-2R-within-all.json, 292/1049 passed (28%), r=-0.065, t~-2.09; " +
      "2026-09-11-15Min-2R-within-all.json, 297/1061 (28%), r=-0.078, t~-2.54, Delta=-0.245R; " +
      "2026-09-14-15Min-2R-within-all.json, 289/985, Delta=-0.261R. The much larger 1Hour populations " +
      "read flat-positive and not significant (2026-09-10-1Hour-2R-within-all.json, 2645/10472, " +
      "r=+0.0069, t~0.70; 2026-09-14-1Hour, 2647/10480, Delta=+0.020R), which is the timeframe " +
      "disagreement masterStructural's entry describes. That disagreement was never resolved either " +
      "way and no longer needs to be — the criterion is gone for a reason that does not depend on it, " +
      "and the quarantine's stated exit condition (a maintainer's call that the 15Min runs are " +
      "non-representative, or a preponderance of non-inverted runs) is moot.",
  },
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
    note:
      "Failed by construction whenever it appears at all: `applyReversionConfirmation` only appends " +
      "this breakdown item on the early-return path taken when `confirmed` is false (a bare 2-2 pattern " +
      "on an Execute verdict that didn't get momentum+S/R confirmation) — there is no code path that " +
      "appends it with `passed: true`. First surfaced as a `starved` (0% pass) finding 2026-09-14 once " +
      "committed observation counts (31 at 15Min, 464 at 1Hour) cleared MIN_OBSERVATIONS_FOR_SATURATION " +
      "for the first time; every previous committed run had only 1 observation, too few to trip the " +
      "check. Same shape as `patternArmed` above (constant by construction, not a discrimination " +
      "defect), so it gets the same override.",
    saturation: { minPassRate: 0, maxPassRate: 1 },
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
