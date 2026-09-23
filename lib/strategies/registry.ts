/**
 * Strategy Modes registry — dispatches a `StrategyModeId` to its evaluator.
 *
 * `"gann"` is deliberately not in this map: it is not one of these opt-in
 * modes, it is the platform default, handled by the existing
 * `lib/gann/entryTrigger.ts` / `lib/strat/levels.ts` pipeline everywhere
 * Strategy Modes are not explicitly selected. Callers that want "whatever
 * mode a human picked, defaulting to Gann" should check for `"gann"`
 * themselves and fall back to the existing Gann trade plan rather than
 * calling into this registry.
 */

import type { Bar } from "@/lib/types";
import type { StrategyEvaluator, StrategyLevels } from "./types";
import { evaluatePsarSupertrend } from "./psarSupertrend";
import { evaluateSaraStrat } from "./saraStrat";
import { evaluateMaCrossover } from "./maCrossover";
import { evaluateBollinger } from "./bollinger";
import { evaluateRsiReversal } from "./rsiReversal";
import { evaluateMacdMomentum } from "./macdMomentum";
import { evaluateVwap } from "./vwap";
import { evaluateStochastic } from "./stochastic";
import { evaluateDonchian } from "./donchian";

export const NON_GANN_STRATEGY_EVALUATORS = {
  psarSupertrend: evaluatePsarSupertrend,
  saraStrat: evaluateSaraStrat,
  maCrossover: evaluateMaCrossover,
  bollinger: evaluateBollinger,
  rsiReversal: evaluateRsiReversal,
  macdMomentum: evaluateMacdMomentum,
  vwap: evaluateVwap,
  stochastic: evaluateStochastic,
  donchian: evaluateDonchian,
} satisfies Record<string, StrategyEvaluator>;

export type NonGannStrategyModeId = keyof typeof NON_GANN_STRATEGY_EVALUATORS;

export function isNonGannStrategyMode(mode: string): mode is NonGannStrategyModeId {
  return mode in NON_GANN_STRATEGY_EVALUATORS;
}

/** Evaluate one non-Gann strategy mode against closed bars. Returns `null`
 * both when the mode is unrecognized and when the mode itself found nothing
 * armed — callers that need to distinguish the two should call
 * `isNonGannStrategyMode` first. */
export function evaluateStrategyMode(mode: string, bars: Bar[]): StrategyLevels | null {
  if (!isNonGannStrategyMode(mode)) return null;
  return NON_GANN_STRATEGY_EVALUATORS[mode](bars);
}
