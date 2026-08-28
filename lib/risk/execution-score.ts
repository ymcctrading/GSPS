/**
 * User execution score — behavior/process adherence as the primary
 * user-performance signal for the dynamic-risk policy.
 *
 * Deliberately not profitability: luck can reward poor behavior, and correct
 * execution can still lose. Raw P&L may be displayed elsewhere, but must
 * never be an input here — that is the whole reason this module exists
 * rather than sizing risk off a win rate.
 */

import { EXECUTION_SCORE_WEIGHTS } from "@/lib/risk/config";

/** Each metric is a 0-1 adherence ratio (fraction of qualifying trades that met the standard). */
export interface ExecutionScoreInputs {
  stopDiscipline: number;
  positionSizing: number;
  entryDiscipline: number;
  exitPlanAdherence: number;
  frequencyDiscipline: number;
  correlationDiscipline: number;
  journalCompletion: number;
}

export interface ExecutionScore {
  /** 0-100. */
  score: number;
  /** Per-metric contribution to the total, for the "why" breakdown. */
  breakdown: Record<keyof ExecutionScoreInputs, number>;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function computeExecutionScore(inputs: ExecutionScoreInputs): ExecutionScore {
  const breakdown = {} as Record<keyof ExecutionScoreInputs, number>;
  let total = 0;
  for (const key of Object.keys(EXECUTION_SCORE_WEIGHTS) as (keyof ExecutionScoreInputs)[]) {
    const contribution = clamp01(inputs[key]) * EXECUTION_SCORE_WEIGHTS[key] * 100;
    breakdown[key] = contribution;
    total += contribution;
  }
  return { score: total, breakdown };
}
