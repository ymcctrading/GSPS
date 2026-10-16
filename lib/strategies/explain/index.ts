/**
 * Explain-the-math registry: a built-in Strategy Mode id to its explainer.
 * See ./types.ts. `"gann"` has no entry: GSPS's plan needs no second reading.
 */

import type { Bar } from "@/lib/types";
import type { NonGannStrategyModeId } from "../registry";
import {
  explainBollinger,
  explainDonchian,
  explainMacdMomentum,
  explainMaCrossover,
  explainPsarSupertrend,
  explainRsiReversal,
  explainSaraStrat,
  explainStochastic,
  explainVwap,
} from "./modes";
import type { PlanExplainer, PlanInput, PlanReading } from "./types";

export const PLAN_EXPLAINERS = {
  psarSupertrend: explainPsarSupertrend,
  saraStrat: explainSaraStrat,
  maCrossover: explainMaCrossover,
  bollinger: explainBollinger,
  rsiReversal: explainRsiReversal,
  macdMomentum: explainMacdMomentum,
  vwap: explainVwap,
  stochastic: explainStochastic,
  donchian: explainDonchian,
} satisfies Record<NonGannStrategyModeId, PlanExplainer>;

export function explainPlan(
  mode: NonGannStrategyModeId,
  bars: Bar[],
  plan: PlanInput,
): PlanReading | null {
  return PLAN_EXPLAINERS[mode](bars, plan);
}

export type {
  PlanInput,
  PlanReading,
  PlanLevelReading,
  PlanLevelKey,
} from "./types";
export { explainCustomScript } from "./custom";
export { parsePlanParams, planQuery } from "./params";
