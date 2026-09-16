/**
 * What each criterion is worth.
 *
 * All nine criteria were worth exactly one point until 2026-09-14, which was
 * never a measured choice — it was the placeholder you start with before you
 * can measure anything. `lib/backtest/attribution.ts` produces the number a
 * weight should actually be set from (`deltaExpectancyR`: how much better a
 * trade did when the criterion passed), and `lib/backtest/propose-weights.ts`
 * turns that into a proposal. `DEFAULT_CRITERION_WEIGHTS` below is now a
 * hand-set, evidence-based rebalance rather than that uniform placeholder —
 * see its own doc comment and AGENTS.md's "Temporary overrides" section for
 * why and what would revert it.
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

/** Stable ids for the nine scored criteria. */
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
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

/**
 * Ids for the checks that are appended after scoring to explain a held state.
 * They carry no points and take no weight, but they are keyed too so the
 * replay's factor table and the UI can identify them without string matching.
 */
export type HoldKey = "tradePlanPriced" | "reversionConfirmation" | "dataLag";

/**
 * Runtime list of `HoldKey`, for a caller that needs to test membership
 * rather than just the type — `lib/scoring/public-summary.ts` uses this to
 * tell an actual held-verdict explanation apart from a `CandidateKey`
 * diagnostic, now that both are unpillared breakdown items. Keeping this next
 * to `HoldKey` means the two cannot drift apart the way a second, hand-copied
 * list would risk.
 */
export const HOLD_KEYS: readonly HoldKey[] = ["tradePlanPriced", "reversionConfirmation", "dataLag"];

/**
 * Ids for candidate criteria under the unmeasured -> hypothesis ->
 * in/out-of-sample discipline in docs/PROPOSAL_NEW_GANN_CRITERIA.md — recorded
 * on every decision's breakdown (unlike `HoldKey`, which is conditional) so
 * `lib/backtest/attribution.ts` can measure them, but never one of the nine
 * scored points: no `pillar`, no entry in `CRITERION_KEYS`, no weight. See
 * `lib/validation/criteria-registry.ts`'s "candidate" family.
 */
export type CandidateKey = "annualCycleActive";

export type BreakdownKey = CriterionKey | HoldKey | CandidateKey;

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
};

export type CriterionWeights = Record<CriterionKey, number>;

/** Total points a full weight set distributes. Nine criteria, nine points. */
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
 * (not a joint-distribution guarantee) — see the weight rebalance below for
 * the other half of this fix.
 */
export const EXECUTE_SCORE_THRESHOLD = 6;
export const WATCH_SCORE_THRESHOLD = 3.5;

/**
 * Floor and ceiling for one criterion's weight. A criterion may end up worth
 * half a point or two points, never zero (which would delete it without anyone
 * deciding to) and never more than two (which would let it out-vote four
 * others).
 */
export const MIN_WEIGHT = 0.5;
export const MAX_WEIGHT = 2;

/**
 * TEMPORARY OVERRIDE (since 2026-09-14) — see AGENTS.md's "Temporary
 * overrides" section, `DEFAULT_CRITERION_WEIGHTS` entry, for the full
 * reasoning and the mandatory revert trigger.
 *
 * No longer "one point each." This is the fallback every real caller
 * actually scores with today: `lib/scoring/score.ts` falls back to it when
 * no explicit weights are supplied, and `lib/scoring/active-weights.ts`
 * falls back to it whenever no weight set has been promoted to `live` in
 * `learning_models` — which, as of this change, is every deployment, so
 * this constant *is* production's live weight set, not a placeholder.
 *
 * Hand-set from `docs/replay-runs/2026-09-11-15Min-2R-within-all.json`'s
 * factors table (1061 unconditioned trades) rather than run through
 * `lib/backtest/propose-weights.ts`'s proper in/out-of-sample split — there
 * was only one committed run to work from, not the two chronological halves
 * that function requires, so this is a judgment call sized in the same
 * direction its step formula would move, not that function's own output.
 * Four criteria measured positive and either validated or consistently
 * reproducing (historicalSR, stopRoom, swingChartTrend, volumeClimax) are
 * moved up; four measured negative on this run, two of them independently
 * quarantined for a significant inversion (adxTrendStrength, gannAngleSlope,
 * gannRetracementConfluence, timePriceSquare) are dropped to `MIN_WEIGHT`;
 * `patternArmed` (structurally necessary, unmeasurable by construction)
 * stays near 1. Values before `normalizeWeights()`'s clamp-and-rescale:
 * historicalSR 1.99 (nudged 0.01 off the intended 2.0 so the rounded,
 * renormalized set lands on exactly 9.00 rather than 9.01 — `round()`
 * rounds each weight to 2 decimals after rescaling, which can drift the sum
 * by a cent), stopRoom 1.8, swingChartTrend 1.3, volumeClimax 1.3,
 * patternArmed 1.0, timePriceSquare 0.6, gannAngleSlope 0.5,
 * gannRetracementConfluence 0.5, adxTrendStrength 0.5.
 */
export const DEFAULT_CRITERION_WEIGHTS: CriterionWeights = normalizeWeights({
  historicalSR: 1.99,
  stopRoom: 1.8,
  swingChartTrend: 1.3,
  volumeClimax: 1.3,
  patternArmed: 1.0,
  timePriceSquare: 0.6,
  gannAngleSlope: 0.5,
  gannRetracementConfluence: 0.5,
  adxTrendStrength: 0.5,
});

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
