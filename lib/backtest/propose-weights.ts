/**
 * Turning attribution into a weight proposal.
 *
 * `attribution.ts` is careful about the things that make a factor study lie: it
 * refuses constant criteria, refuses arms under ten trades, treats an absent
 * criterion as "not evaluated" rather than "failed", and correlates against R
 * rather than win/loss so a factor that trades win rate for payoff does not read
 * as neutral. What it produces — `deltaExpectancyR`, how much better a trade did
 * when a criterion passed — is precisely the number a weight should be set from.
 * Nothing consumed it. This does.
 *
 * The guardrails, in the order they bite:
 *
 *   1. **Split the run in time, never at random.** In-sample is the earlier
 *      trades and out-of-sample the later ones. A shuffled split leaks the same
 *      market conditions into both halves and validates nothing.
 *   2. **A criterion must be `informative` in BOTH halves.** Constant or
 *      thin-armed on either side means the sample cannot see it.
 *   3. **Both halves must agree on the sign.** A factor that helped in the first
 *      half and hurt in the second is noise wearing a result's clothes.
 *   4. **The effect must clear `MIN_EFFECT_R`.** Below that the difference is
 *      inside the friction the replay already charges.
 *   5. **The move is sized off the weaker half.** Taking the stronger reading
 *      would let the in-sample fit set the weight and the out-of-sample check
 *      merely permit it.
 *   6. **Steps are capped, weights are clamped, and the set is renormalised to
 *      nine points** (`lib/scoring/weights.ts`), so the Execute/Watch cutoffs
 *      keep meaning what they meant.
 *
 * A proposal is a proposal. It is written as a `draft` model and changes no
 * score until a human promotes it — see `lib/scoring/active-weights.ts`.
 */

import { attributeFactors, type FactorAttribution } from "./attribution";
import type { ReplayTrade } from "./replay";
import {
  CRITERION_KEYS,
  DEFAULT_CRITERION_WEIGHTS,
  MAX_WEIGHT,
  MIN_WEIGHT,
  normalizeWeights,
  type CriterionKey,
  type CriterionWeights,
} from "@/lib/scoring/weights";

/**
 * Smallest expectancy gap worth moving a weight for, in R. A tenth of a unit of
 * risk is roughly five times the round-trip friction the replay charges, so
 * below it the "effect" is plausibly the cost of trading.
 */
export const MIN_EFFECT_R = 0.1;

/**
 * Largest single move, as a fraction of a weight. A criterion can gain or lose
 * a third of its weight in one round; adopting a proposal is not a one-shot
 * rewrite of the score, it is a step that the next run gets to confirm.
 */
export const MAX_STEP = 0.33;

/**
 * R of measured edge that earns a full step. Chosen so a half-R separation —
 * enormous for a single criterion — is what it takes to move a weight the whole
 * `MAX_STEP`, and a marginal 0.1R barely moves it at all.
 */
export const FULL_STEP_EFFECT_R = 0.5;

/** Minimum trades in each half before the split is worth running at all. */
export const MIN_TRADES_PER_HALF = 40;

export type ProposalOutcome =
  /** Both halves agreed, the effect cleared the floor, the weight moves. */
  | "adopted"
  /** Measured in both halves, but the two disagreed on the sign. */
  | "disagreed"
  /** One half or both could not read the criterion at all. */
  | "unreadable"
  /** Read in both, agreed, but the effect is inside the noise. */
  | "too-small";

export interface CriterionProposal {
  criterion: CriterionKey;
  currentWeight: number;
  /**
   * The weight after the whole set was renormalised to nine points. A criterion
   * whose own outcome was "held" can still move a little here, because holding
   * it constant while another criterion grows would quietly inflate the total —
   * and the total is what the Execute/Watch cutoffs are expressed in.
   */
  proposedWeight: number;
  outcome: ProposalOutcome;
  /** Expectancy gap in the training half, in R. */
  inSampleDeltaR?: number;
  /** Expectancy gap in the held-out half, in R. */
  outOfSampleDeltaR?: number;
  /** Trades that evaluated this criterion, per half. */
  inSampleObserved: number;
  outOfSampleObserved: number;
  /** One sentence a reader can act on. */
  rationale: string;
}

export interface WeightProposal {
  /** Trades used, and where the halves were cut. */
  inSampleTrades: number;
  outOfSampleTrades: number;
  splitAt: string | null;
  /** Null when there were too few trades to split — nothing is proposed. */
  weights: CriterionWeights | null;
  proposals: CriterionProposal[];
  /** True when at least one weight actually moved. */
  changed: boolean;
  /** Why nothing was proposed, when nothing was. */
  refusal: string | null;
}

export interface ProposeOptions {
  /** Fraction of trades (chronologically) used for training. Defaults to 0.7. */
  inSampleFraction?: number;
  /** Weights the proposal is relative to. Defaults to one point each. */
  current?: CriterionWeights;
  minTradesPerHalf?: number;
}

/**
 * Split trades chronologically into a training half and a held-out half.
 *
 * Exported because the split is the part of an out-of-sample claim most easily
 * got wrong, and it deserves its own tests.
 */
export function splitChronologically(
  trades: ReplayTrade[],
  fraction: number,
): { inSample: ReplayTrade[]; outOfSample: ReplayTrade[]; splitAt: string | null } {
  const ordered = [...trades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const cut = Math.floor(ordered.length * fraction);
  const inSample = ordered.slice(0, cut);
  const outOfSample = ordered.slice(cut);
  return {
    inSample,
    outOfSample,
    splitAt: outOfSample[0]?.openedAt ?? null,
  };
}

export function proposeWeights(
  trades: ReplayTrade[],
  options: ProposeOptions = {},
): WeightProposal {
  const {
    inSampleFraction = 0.7,
    current = DEFAULT_CRITERION_WEIGHTS,
    minTradesPerHalf = MIN_TRADES_PER_HALF,
  } = options;

  const { inSample, outOfSample, splitAt } = splitChronologically(trades, inSampleFraction);

  if (inSample.length < minTradesPerHalf || outOfSample.length < minTradesPerHalf) {
    return {
      inSampleTrades: inSample.length,
      outOfSampleTrades: outOfSample.length,
      splitAt,
      weights: null,
      proposals: [],
      changed: false,
      refusal: `Not enough trades to split: ${inSample.length} in-sample and ${outOfSample.length} out-of-sample against a floor of ${minTradesPerHalf} each. Widen the universe or the date range.`,
    };
  }

  const inFactors = index(attributeFactors(inSample));
  const outFactors = index(attributeFactors(outOfSample));

  const proposals: CriterionProposal[] = CRITERION_KEYS.map((criterion) =>
    proposeOne(criterion, current[criterion] ?? 1, inFactors.get(criterion), outFactors.get(criterion)),
  );

  const weights = normalizeWeights(
    Object.fromEntries(proposals.map((p) => [p.criterion, p.proposedWeight])) as Record<
      CriterionKey,
      number
    >,
  );

  return {
    inSampleTrades: inSample.length,
    outOfSampleTrades: outOfSample.length,
    splitAt,
    weights,
    proposals: proposals.map((p) => ({ ...p, proposedWeight: weights[p.criterion] })),
    changed: CRITERION_KEYS.some((k) => weights[k] !== (current[k] ?? 1)),
    refusal: null,
  };
}

function index(factors: FactorAttribution[]): Map<CriterionKey, FactorAttribution> {
  const out = new Map<CriterionKey, FactorAttribution>();
  for (const f of factors) {
    if ((CRITERION_KEYS as readonly string[]).includes(f.criterion)) {
      out.set(f.criterion as CriterionKey, f);
    }
  }
  return out;
}

function proposeOne(
  criterion: CriterionKey,
  currentWeight: number,
  inSample: FactorAttribution | undefined,
  outOfSample: FactorAttribution | undefined,
): CriterionProposal {
  const base = {
    criterion,
    currentWeight,
    proposedWeight: currentWeight,
    inSampleObserved: inSample?.observed ?? 0,
    outOfSampleObserved: outOfSample?.observed ?? 0,
    inSampleDeltaR: inSample?.deltaExpectancyR,
    outOfSampleDeltaR: outOfSample?.deltaExpectancyR,
  };

  const readable =
    inSample?.verdict === "informative" &&
    outOfSample?.verdict === "informative" &&
    inSample.deltaExpectancyR !== undefined &&
    outOfSample.deltaExpectancyR !== undefined;

  if (!readable) {
    return {
      ...base,
      outcome: "unreadable",
      rationale: `Not readable in both halves (${verdictOf(inSample)} in-sample, ${verdictOf(outOfSample)} out-of-sample) — weight held.`,
    };
  }

  const a = inSample.deltaExpectancyR!;
  const b = outOfSample.deltaExpectancyR!;

  if (Math.sign(a) !== Math.sign(b)) {
    return {
      ...base,
      outcome: "disagreed",
      rationale: `Halves disagree (${fmt(a)} in-sample, ${fmt(b)} out-of-sample) — weight held.`,
    };
  }

  // Sized off the weaker half: the out-of-sample check has to constrain the
  // move, not merely permit it.
  const effect = Math.sign(a) * Math.min(Math.abs(a), Math.abs(b));

  if (Math.abs(effect) < MIN_EFFECT_R) {
    return {
      ...base,
      outcome: "too-small",
      rationale: `Agreed but small (${fmt(effect)} on the weaker half, floor ${MIN_EFFECT_R}R) — weight held.`,
    };
  }

  const step = clamp(effect / FULL_STEP_EFFECT_R, -1, 1) * MAX_STEP;
  const proposedWeight = round(clamp(currentWeight * (1 + step), MIN_WEIGHT, MAX_WEIGHT));

  return {
    ...base,
    proposedWeight,
    outcome: "adopted",
    rationale: `${effect > 0 ? "Up-weight" : "Down-weight"}: ${fmt(a)} in-sample and ${fmt(b)} out-of-sample, sized off the weaker ${fmt(effect)}.`,
  };
}

function verdictOf(f: FactorAttribution | undefined): string {
  if (!f) return "not evaluated";
  return f.verdict === "constant" ? "never varied" : f.verdict === "insufficient" ? "too few" : "informative";
}

function fmt(r: number): string {
  return `${r >= 0 ? "+" : ""}${r.toFixed(3)}R`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
