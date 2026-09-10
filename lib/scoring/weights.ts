/**
 * What each criterion is worth.
 *
 * All nine criteria were worth exactly one point, which was never a measured
 * choice — it was the placeholder you start with before you can measure
 * anything. `lib/backtest/attribution.ts` produces the number a weight should
 * actually be set from (`deltaExpectancyR`: how much better a trade did when the
 * criterion passed), and `lib/backtest/propose-weights.ts` turns that into a
 * proposal.
 *
 * Two invariants hold for every weight set, proposed or hand-written:
 *
 *   - **The total stays at `TOTAL_POINTS`.** The Execute (≥7) and Watch (≥4)
 *     cutoffs are expressed in points, so a weight set that summed to anything
 *     else would silently move both thresholds while appearing to change only
 *     the emphasis.
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
  "harmonicProximity",
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

export type BreakdownKey = CriterionKey | HoldKey;

/** Short labels for the factor tables, where the full criterion text is too wide. */
export const CRITERION_LABELS: Record<CriterionKey, string> = {
  swingChartTrend: "3-day/9-day swing chart trend",
  adxTrendStrength: "1-hour trend strength (ADX/DMI)",
  gannAngleSlope: "Structural trend-angle strength (1x1)",
  harmonicProximity: "Key price level proximity",
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
 * `7`/`4` literals `lib/scoring/score.ts` computed `outputState` from — every
 * other caller that needs to ask "is this actually good, not just the best
 * of what's left" (e.g. `lib/marketScan.ts`'s continuation top-up pass)
 * reuses these instead of re-deriving its own notion of "good enough."
 */
export const EXECUTE_SCORE_THRESHOLD = 7;
export const WATCH_SCORE_THRESHOLD = 4;

/**
 * Floor and ceiling for one criterion's weight. A criterion may end up worth
 * half a point or two points, never zero (which would delete it without anyone
 * deciding to) and never more than two (which would let it out-vote four
 * others).
 */
export const MIN_WEIGHT = 0.5;
export const MAX_WEIGHT = 2;

/** One point each — the score as it has always been computed. */
export const DEFAULT_CRITERION_WEIGHTS: CriterionWeights = Object.fromEntries(
  CRITERION_KEYS.map((k) => [k, 1]),
) as CriterionWeights;

export function isDefaultWeights(weights: CriterionWeights): boolean {
  return CRITERION_KEYS.every((k) => weights[k] === 1);
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
