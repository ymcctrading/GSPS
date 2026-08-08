/**
 * Per-factor attribution over a replay run.
 *
 * The replay says whether the system made money. This says *which criteria the
 * winners had*, which is the only thing that tells you what to re-weight. It
 * answers one question per criterion: when this passed, did the trade do
 * better than when it failed — and by enough to outrun the noise in the sample?
 *
 * Three deliberate refusals, because each of them is a way a factor study
 * quietly lies:
 *
 *   - A criterion absent from a trade is "not evaluated", never "failed". Two
 *     of the score's criteria are appended only in the cases that trigger them,
 *     so counting absence as a fail would manufacture a large fake sample of
 *     losers for both.
 *   - A criterion that never varies within the sample gets no correlation and
 *     no recommendation. Inside the Execute bucket several criteria are near-
 *     constant by construction, and dividing by a zero standard deviation
 *     produces either NaN or a confident-looking 0 — both worse than saying
 *     "this bucket cannot see this factor".
 *   - Below `minSamples` on either side, the split is reported but carries no
 *     recommendation. A 3-trade arm will happily show a 1.0 correlation.
 *
 * What it deliberately does not do is claim causation. A criterion can look
 * predictive because it co-occurs with one that is; `correlation` is marginal,
 * not partial. Treat a strong reading as a hypothesis to re-run, not a result.
 */

import type { ReplayTrade } from "./replay";

/**
 * Minimum trades on *each* side of a split before a recommendation is offered.
 * Ten is not a statistical guarantee — it is the point below which the split
 * is obviously anecdote. Mirrors the sample-size floor in the Python
 * scanner's backtest.py so both tools refuse at the same place.
 */
export const MIN_SAMPLES_PER_ARM = 10;

export interface FactorArm {
  n: number;
  wins: number;
  winRate: number;
  /** Mean R across this arm, after costs. */
  expectancyR: number;
}

export type FactorVerdict =
  /** Both arms cleared `minSamples`; the split is worth reading. */
  | "informative"
  /** The criterion never varied here — this sample cannot measure it. */
  | "constant"
  /** It varied, but one arm is too small to read. */
  | "insufficient";

export interface FactorAttribution {
  criterion: string;
  /** Trades where this criterion was evaluated at all. */
  observed: number;
  passed: FactorArm;
  failed: FactorArm;
  /**
   * passed.expectancyR − failed.expectancyR. The lever, in R.
   *
   * Undefined when the criterion never varied. An empty arm has an expectancy
   * of zero, so subtracting it would report the populated arm's expectancy as
   * though it were a measured difference — a criterion every trade passed
   * would show the bucket's own expectancy as its "effect".
   */
  deltaExpectancyR?: number;
  /** passed.winRate − failed.winRate. Undefined for a constant criterion. */
  deltaWinRate?: number;
  /**
   * Point-biserial correlation between "criterion passed" (1/0) and the
   * trade's realised R. Correlated against R rather than win/loss because
   * expectancy is the objective — a factor that trades win rate for payoff
   * size should not read as neutral. Undefined when either side is constant.
   */
  correlation?: number;
  verdict: FactorVerdict;
}

export interface AttributionOptions {
  /** Per-arm floor for a recommendation. Defaults to MIN_SAMPLES_PER_ARM. */
  minSamples?: number;
}

function arm(trades: ReplayTrade[]): FactorArm {
  const n = trades.length;
  const wins = trades.filter((t) => t.outcome === "win").length;
  return {
    n,
    wins,
    winRate: n === 0 ? 0 : wins / n,
    expectancyR: n === 0 ? 0 : trades.reduce((s, t) => s + t.rMultiple, 0) / n,
  };
}

/** Pearson correlation. Undefined when either series has no spread. */
function correlate(xs: number[], ys: number[]): number | undefined {
  const n = xs.length;
  if (n < 2) return undefined;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  // A constant arm (every trade passed, or every R identical) has no spread to
  // correlate against. Returning 0 here would read as "measured, no effect".
  if (sxx <= 0 || syy <= 0) return undefined;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Split a set of trades by each criterion the score evaluated.
 *
 * Pass the trades of a single bucket to ask what separates winners *within*
 * that bucket — which is the question worth asking once one bucket is already
 * known to be the profitable one. Passing every trade instead measures the
 * criteria's raw selectivity, which mostly re-derives the bucket boundaries.
 *
 * Sorted by descending expectancy delta, informative factors first, so the top
 * of the list is the strongest candidate to up-weight and the bottom is the
 * strongest to cut.
 */
export function attributeFactors(
  trades: ReplayTrade[],
  options: AttributionOptions = {},
): FactorAttribution[] {
  const { minSamples = MIN_SAMPLES_PER_ARM } = options;

  const criteria = new Set<string>();
  for (const t of trades) {
    if (t.criteria) for (const key of Object.keys(t.criteria)) criteria.add(key);
  }

  const out: FactorAttribution[] = [];
  for (const criterion of criteria) {
    // Absent means "not evaluated on this setup", so it drops out of both arms
    // rather than landing in `failed`.
    const observed = trades.filter((t) => t.criteria?.[criterion] !== undefined);
    const passed = observed.filter((t) => t.criteria![criterion]);
    const failed = observed.filter((t) => !t.criteria![criterion]);

    const passedArm = arm(passed);
    const failedArm = arm(failed);

    const verdict: FactorVerdict =
      passed.length === 0 || failed.length === 0
        ? "constant"
        : passed.length < minSamples || failed.length < minSamples
          ? "insufficient"
          : "informative";

    const varied = verdict !== "constant";
    out.push({
      criterion,
      observed: observed.length,
      passed: passedArm,
      failed: failedArm,
      deltaExpectancyR: varied ? passedArm.expectancyR - failedArm.expectancyR : undefined,
      deltaWinRate: varied ? passedArm.winRate - failedArm.winRate : undefined,
      correlation: varied
        ? correlate(
            observed.map((t) => (t.criteria![criterion] ? 1 : 0)),
            observed.map((t) => t.rMultiple),
          )
        : undefined,
      verdict,
    });
  }

  const rank: Record<FactorVerdict, number> = { informative: 0, insufficient: 1, constant: 2 };
  return out.sort(
    (a, b) =>
      rank[a.verdict] - rank[b.verdict] || (b.deltaExpectancyR ?? 0) - (a.deltaExpectancyR ?? 0),
  );
}

/**
 * Expectancy sliced by stop width in ATR.
 *
 * Called out separately from the criteria because it is the one continuous
 * lever the protocol already exposes — `riskFloorViolated` and
 * `MAX_STOP_ATR_MULTIPLE` are both thresholds on this number, and both are
 * knowable before the trade is taken. Bars-held is not: it is only known
 * afterwards, so it cannot be turned into a rule.
 *
 * Edges are the band lower bounds; the last band is open-ended.
 */
export function attributeByAtrMultiple(
  trades: ReplayTrade[],
  edges: number[] = [0, 0.5, 1, 1.5, 2, 2.5],
): Array<{ from: number; to: number | null; arm: FactorArm }> {
  return edges.map((from, i) => {
    const to = i + 1 < edges.length ? edges[i + 1] : null;
    return {
      from,
      to,
      arm: arm(trades.filter((t) => t.atrMultiple >= from && (to === null || t.atrMultiple < to))),
    };
  });
}
