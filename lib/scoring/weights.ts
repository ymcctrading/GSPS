/**
 * What each criterion is worth.
 *
 * Every criterion is worth exactly one point. That was the original state, a
 * hand-set distribution replaced it on 2026-09-14, and 2026-09-16 restored
 * it — but for a different reason than it originally held, and the
 * difference matters. Uniform is not the placeholder you start with before
 * you can measure anything; it is the only distribution that keeps the
 * scorecard a count of Gann's conditions rather than a ranking of them. See
 * `DEFAULT_CRITERION_WEIGHTS`'s own doc comment and AGENTS.md's
 * "Gann-derived AND measured" and "The scorecard's role" principles.
 *
 * `lib/backtest/attribution.ts` still produces `deltaExpectancyR` (how much
 * better a trade did when the criterion passed) and
 * `lib/backtest/propose-weights.ts` still turns it into a proposal. Under
 * those principles that machinery points at *our translation* of a Gann rule
 * — a criterion measuring backwards is a porting defect to find — rather
 * than serving as a verdict on which of Gann's conditions deserves more
 * weight.
 *
 * Two invariants hold for every weight set, proposed or hand-written:
 *
 *   - **The total stays at `TOTAL_POINTS`.** The Execute/Watch cutoffs
 *     (`EXECUTE_SCORE_THRESHOLD`/`WATCH_SCORE_THRESHOLD`) are expressed in
 *     points, so a weight set that summed to anything else would silently
 *     move both thresholds while appearing to change only the emphasis.
 *   - **Every weight stays inside [`MIN_WEIGHT`, `MAX_WEIGHT`].** A criterion
 *     that measured well on one sample is still one criterion; letting it grow
 *     without bound would let a single factor carry a verdict on its own.
 *
 * Weights are keyed by a stable id rather than the criterion's display text, so
 * rewording a criterion cannot silently detach its weight.
 */

/**
 * Stable ids for the ten scored criteria.
 *
 * `ruleOfThree` added 2026-09-16 — the tenth, per AGENTS.md's "WD Gann
 * precedence" principle and `docs/GANN_PLATFORM_AUDIT.md` Part 4 item 1:
 * Gann's own highest-conviction disclosed rule (`Wall Street Stock
 * Selector`, 1930), wired live ahead of this codebase's normal
 * unmeasured -> attribution -> in/out-of-sample gate. See
 * `lib/gann/ruleOfThree.ts` and `lib/validation/criteria-registry.ts`'s
 * `ruleOfThree` entry.
 */
export const CRITERION_KEYS = [
  "swingChartTrend",
  "adxTrendStrength",
  "gannAngleSlope",
  "volumeClimax",
  "historicalSR",
  "patternArmed",
  "stopRoom",
  "timePriceSquare",
  "gannRetracementConfluence",
  "ruleOfThree",
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

/**
 * Ids for the checks that are appended after scoring to explain a held state.
 * They carry no points and take no weight, but they are keyed too so the
 * replay's factor table and the UI can identify them without string matching.
 */
export type HoldKey = "tradePlanPriced" | "reversionConfirmation" | "dataLag";

export type BreakdownKey = CriterionKey | HoldKey;

/** Short labels for the factor tables, where the full criterion text is too wide. */
export const CRITERION_LABELS: Record<CriterionKey, string> = {
  swingChartTrend: "3-day/9-day swing chart trend",
  adxTrendStrength: "1-hour trend strength (ADX/DMI)",
  gannAngleSlope: "Structural trend-angle strength (1x2+)",
  volumeClimax: "Volume climax at the anchor pivot",
  historicalSR: "Historical support/resistance",
  patternArmed: "Pattern armed",
  stopRoom: "Stop room (>= 1.5x ATR)",
  timePriceSquare: "Price and time squared",
  gannRetracementConfluence: "Retracement + signal-flow confluence",
  ruleOfThree: "Rule of Three (consecutive closes confirm direction)",
};

export type CriterionWeights = Record<CriterionKey, number>;

/** Total points a full weight set distributes. Ten criteria, ten points. */
export const TOTAL_POINTS = CRITERION_KEYS.length;

/**
 * The Execute and Watch score cutoffs, named rather than left as the bare
 * literals `lib/scoring/score.ts` computed `outputState` from — every
 * other caller that needs to ask "is this actually good, not just the best
 * of what's left" (e.g. `lib/marketScan.ts`'s continuation top-up pass)
 * reuses these instead of re-deriving its own notion of "good enough."
 *
 * TEMPORARY OVERRIDE (since 2026-09-14) — see AGENTS.md's "Temporary
 * overrides" section, `EXECUTE_SCORE_THRESHOLD` entry, for the full
 * reasoning and the mandatory revert trigger. Short version: the original
 * `7`/`4` pair was set when the nine criteria were lenient, commonly-passing
 * checks (2-of-3 trend agreement, ~1.5%-of-price proximity bands). Between
 * 2026-09-10 and -11 every one of them was replaced with a specific,
 * individually rare Gann technical event (pass rates 6%-29% each, see
 * `docs/replay-runs/2026-09-11-15Min-2R-within-all.json`'s factors table).
 * Nine independent-ish rare events essentially never co-occur at the old 7/9
 * bar — the committed run shows 0/1061 Execute, and the live deployment
 * produced 0 executable trades before this change. Lowered from 7/4 to 6/3.5
 * as a stopgap sized off that same run under an independence approximation
 * (not a joint-distribution guarantee). The weight rebalance that was the
 * other half of this fix has since been undone on principle (see
 * `DEFAULT_CRITERION_WEIGHTS` below); this threshold stopgap stands on its
 * own and still carries its original revert trigger.
 *
 * Rescaled 2026-09-16 from 6/3.5 (out of 9) to 6.67/3.89 (out of 10) when
 * `ruleOfThree` became the tenth criterion (see `CRITERION_KEYS`) — the same
 * 66.7%/38.9% relative bar, not a new, separate loosening or tightening
 * decision. Adding a criterion and re-judging how hard the bar should be to
 * clear are two different questions; this preserves the existing stopgap's
 * answer to the second one exactly, rather than quietly changing it as a
 * side effect of the first.
 */
export const EXECUTE_SCORE_THRESHOLD = 6.67;
export const WATCH_SCORE_THRESHOLD = 3.89;

/**
 * Floor and ceiling for one criterion's weight. A criterion may end up worth
 * half a point or two points, never zero (which would delete it without anyone
 * deciding to) and never more than two (which would let it out-vote four
 * others).
 */
export const MIN_WEIGHT = 0.5;
export const MAX_WEIGHT = 2;

/**
 * One point each — the count of how many of Gann's confirming conditions a
 * setup satisfies, with no claim layered on top about which of them matters
 * more.
 *
 * This is the fallback every real caller actually scores with:
 * `lib/scoring/score.ts` falls back to it when no explicit weights are
 * supplied, and `lib/scoring/active-weights.ts` falls back to it whenever no
 * weight set has been promoted to `live` in `learning_models` — which is
 * every deployment today, so this constant *is* production's live weight
 * set, not a placeholder.
 *
 * **Restored to uniform 2026-09-16**, replacing the hand-set distribution
 * that stood from 2026-09-14 (historicalSR 1.99, stopRoom 1.8,
 * swingChartTrend/volumeClimax 1.3, patternArmed/ruleOfThree 1.0,
 * timePriceSquare 0.6, and gannAngleSlope/gannRetracementConfluence/
 * adxTrendStrength at `MIN_WEIGHT`). Two standing principles in AGENTS.md
 * decide this, and neither is about those numbers measuring badly:
 *
 *   - "Gann-derived AND measured" — the old distribution was built by
 *     treating attribution as a verdict on the criteria themselves,
 *     up-weighting the measured-positive and down-weighting the
 *     measured-negative. That is exactly the jury role that principle denies
 *     measurement. A criterion measuring negative is a suspected porting
 *     defect on our side (wrong anchor, wrong scale, wrong timeframe) to be
 *     found and fixed, not a criterion to quietly discount.
 *   - "The scorecard's role" — the scorecard contributes no substance of its
 *     own. A non-equal weight asserts that one of Gann's conditions outranks
 *     another, and nothing in `docs/GANN_HISTORICAL_SOURCES.md` ranks the
 *     confirming conditions against each other. Every "most important" in
 *     that catalog sits *within* a technique (50% among retracement levels,
 *     the 20-year Master Time Period among cycles, 1/2 = 26 weeks among the
 *     52-week fractions), never across them.
 *
 * What would legitimately move it off uniform: a citable Gann statement of
 * cross-criterion importance (none found as of 2026-09-16), or
 * `lib/backtest/propose-weights.ts`'s real in/out-of-sample output used to
 * correct a translation rather than to rank Gann's conditions.
 *
 * `normalizeWeights()` rescales any set to sum to `TOTAL_POINTS`, so this
 * change moved *which* setups reach `EXECUTE_SCORE_THRESHOLD` without moving
 * the point scale that threshold is expressed in.
 */
export const DEFAULT_CRITERION_WEIGHTS: CriterionWeights = normalizeWeights(
  Object.fromEntries(CRITERION_KEYS.map((k) => [k, 1])) as Record<CriterionKey, number>,
);

export function isDefaultWeights(weights: CriterionWeights): boolean {
  return CRITERION_KEYS.every((k) => weights[k] === DEFAULT_CRITERION_WEIGHTS[k]);
}

/**
 * Clamp every weight into range, then rescale so the set sums to
 * `TOTAL_POINTS`.
 *
 * Rescaling can push a weight back outside the clamp, so the two steps are
 * iterated a few times rather than applied once. It converges quickly for any
 * input that is not already degenerate; if it does not, the last iterate is
 * returned with the sum honoured, because the sum is the invariant the cutoffs
 * depend on and the clamp is a guardrail on top of it.
 */
export function normalizeWeights(raw: Partial<Record<CriterionKey, number>>): CriterionWeights {
  let weights = CRITERION_KEYS.reduce((acc, k) => {
    const v = raw[k];
    acc[k] = Number.isFinite(v) && (v as number) > 0 ? (v as number) : 1;
    return acc;
  }, {} as CriterionWeights);

  for (let pass = 0; pass < 8; pass++) {
    const clamped = CRITERION_KEYS.reduce((acc, k) => {
      acc[k] = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weights[k]));
      return acc;
    }, {} as CriterionWeights);

    const sum = CRITERION_KEYS.reduce((s, k) => s + clamped[k], 0);
    const scale = sum > 0 ? TOTAL_POINTS / sum : 1;
    weights = CRITERION_KEYS.reduce((acc, k) => {
      acc[k] = clamped[k] * scale;
      return acc;
    }, {} as CriterionWeights);

    if (Math.abs(scale - 1) < 1e-9) break;
  }

  return round(weights);
}

/** Two decimals is finer than any weight decision this data can support. */
function round(weights: CriterionWeights): CriterionWeights {
  return CRITERION_KEYS.reduce((acc, k) => {
    acc[k] = Math.round(weights[k] * 100) / 100;
    return acc;
  }, {} as CriterionWeights);
}

/**
 * Parse a weight set that came from outside the process — a stored model row,
 * an API payload. Anything missing or unusable falls back to 1 rather than
 * throwing: a partial weight set is a weaker statement than a full one, not an
 * error, and a scan must never fail because a proposal was malformed.
 */
export function parseCriterionWeights(value: unknown): CriterionWeights {
  if (!value || typeof value !== "object") return DEFAULT_CRITERION_WEIGHTS;
  const raw = value as Record<string, unknown>;
  return normalizeWeights(
    CRITERION_KEYS.reduce((acc, k) => {
      const n = Number(raw[k]);
      if (Number.isFinite(n) && n > 0) acc[k] = n;
      return acc;
    }, {} as Partial<Record<CriterionKey, number>>),
  );
}
