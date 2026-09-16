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
 * (not a joint-distribution guarantee) — see the weight rebalance below for
 * the other half of this fix.
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
 * Fallback weight set — used only when `learning_models` has no `live`
 * `score_adjustment` row to read (`lib/scoring/active-weights.ts`), or when
 * no explicit weights are supplied to `lib/scoring/score.ts` directly (a
 * unit test, a script). It is not what a configured deployment actually
 * scores with any more — see below.
 *
 * SUPERSEDED (2026-09-16, migration `0065_promote_score_adjustment_v1.sql`):
 * this constant previously carried the 2026-09-14 "Execute collapse"
 * stopgap values by hand (see AGENTS.md's "Temporary overrides" section,
 * `DEFAULT_CRITERION_WEIGHTS` entry, for that history). It has now been
 * replaced with the values from the first real, measured proposal:
 * `lib/backtest/propose-weights.ts` run against 991 real Alpaca-sourced
 * 15Min/2R trades (SPY, AAPL, AMD, TSLA, MSFT, NVDA, 2026-07-20 to
 * 2026-09-16), attributed `within=all` — the unconditioned population,
 * the only scope the proposal endpoint's own design avoids Execute-
 * selection collider bias from (see `app/api/learning/propose-weights/
 * route.ts`'s comment) — and split chronologically at 2026-08-27 (693
 * in-sample / 298 out-of-sample, both clearing `MIN_TRADES_PER_HALF`).
 * That proposal was written as `learning_models` draft v1 and promoted to
 * `live` by the project owner the same day; this constant is kept in sync
 * with that row's `coefficients.criterion_weights` so a deployment with no
 * reachable `learning_models` table (or a test) still scores with the last
 * real measurement rather than silently reverting to the 2026-09-14
 * hand-set numbers.
 *
 * Only `historicalSR` actually moved on real, agreeing, out-of-sample
 * evidence (+0.283R in-sample, +0.109R out-of-sample — 1.88 → 1.97).
 * `adxTrendStrength`/`gannAngleSlope` were already pinned at `MIN_WEIGHT`
 * and stayed there. Every other criterion — including `ruleOfThree`, the
 * Gann-precedence criterion added 2026-09-16 — either disagreed in sign
 * between the two halves (`swingChartTrend`, `gannRetracementConfluence`,
 * `ruleOfThree`: +0.301R in-sample, -0.221R out-of-sample), was too small
 * to clear `MIN_EFFECT_R` (`volumeClimax`, `timePriceSquare`), or was
 * unreadable (`patternArmed` structurally constant; `stopRoom`'s
 * out-of-sample half too thin to trust despite a large raw number), so per
 * `propose-weights.ts`'s own guardrails those weights correctly held.
 *
 * NOT superseded by this promotion: `EXECUTE_SCORE_THRESHOLD` and
 * `WATCH_SCORE_THRESHOLD` above — `propose-weights.ts` only ever proposes
 * *weights*, nothing in this codebase re-derives the thresholds
 * automatically, so they remain the 2026-09-14 hand-set stopgap values
 * until a separate, deliberate pass re-derives them. Also not (yet) fully
 * satisfied: AGENTS.md's stopgap-revert wording calls for "the run's
 * actual Execute-bucket attribution" at n≥30 Execute trades — this
 * promotion used the statistically valid `within=all` scope instead (the
 * Execute-bucket scope has the collider-bias problem cited above), and the
 * 15Min Execute bucket itself is still only 25 trades. See AGENTS.md's
 * "Temporary overrides" section for the reconciled note.
 */
export const DEFAULT_CRITERION_WEIGHTS: CriterionWeights = normalizeWeights({
  historicalSR: 1.97,
  stopRoom: 1.67,
  swingChartTrend: 1.21,
  volumeClimax: 1.21,
  patternArmed: 0.94,
  ruleOfThree: 0.94,
  timePriceSquare: 0.56,
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
