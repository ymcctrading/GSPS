import type { StrategyDirection, StrategyLevels, StrategyModeId } from "./types";

/**
 * Shared R-multiple target projection for every Strategy Mode. Each mode
 * supplies its own entry/stop (the part that actually encodes its
 * indicator's logic); this only turns that risk into a first and master
 * target, the same "entry ± multiple × risk" shape `lib/strat/levels.ts`
 * uses for the Gann pipeline, kept intentionally simpler here since these
 * modes carry no structural-level override — a human reading a Sara Strat or
 * PSAR/Supertrend chart already sees the nearby structure directly.
 */
export function buildLevels(
  mode: StrategyModeId,
  direction: StrategyDirection,
  entry: number,
  stopLoss: number,
  rationale: string,
  tp1R = 1.5,
  mtpR = 3,
): StrategyLevels | null {
  const dir = direction === "bullish" ? 1 : -1;
  const riskPerShare = Math.abs(entry - stopLoss);
  // A trigger on the wrong side of its own stop, or with ~zero risk, is not a
  // real setup — same guard `lib/gann/entryTrigger.ts` applies to its own
  // pipeline.
  if (riskPerShare <= 0 || dir * (entry - stopLoss) <= 0) return null;

  return {
    mode,
    direction,
    entry,
    stopLoss,
    takeProfit1: entry + dir * tp1R * riskPerShare,
    masterTarget: entry + dir * mtpR * riskPerShare,
    riskPerShare,
    rationale,
  };
}
