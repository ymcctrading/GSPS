/**
 * Strategy Modes — opt-in, non-default entry/exit level generation off a
 * user-chosen indicator/strategy, distinct from GSPS's own Gann-grounded
 * scored verdict (Execute/Watch/Avoid).
 *
 * See AGENTS.md's "Strategy Modes" section for the scoped exception this
 * implements (project-owner direction, 2026-09-23) to the "no non-Gann
 * indicator may feed an entry/stop/target" boundary, and
 * `docs/STRATEGY_MODES.md` for the architecture and the three-question
 * design rationale for each mode below.
 *
 * Hard rules every mode here must hold:
 *   - Never the default. `"gann"` is always the default and is what every
 *     scan, the scorecard, and every automated/Automation order-placement
 *     path continue to use unless a human explicitly picked something else
 *     for this one ticket/chart.
 *   - One at a time. A user selects exactly one non-Gann mode to view/trade
 *     by; modes are never combined or averaged.
 *   - Never touches the scored criteria, SignalGates, or the Gann trade
 *     plan (`ScanResult.levels`) — a strategy-mode result is a parallel,
 *     separately-labeled set of levels a human chooses to place an order
 *     from, the same way a human today can type a manual stop/target into
 *     the order ticket.
 */

import type { Bar } from "@/lib/types";

export type StrategyDirection = "bullish" | "bearish";

/** `"gann"` is the platform default and is handled by the existing Gann
 * pipeline (`lib/gann/entryTrigger.ts`, `lib/strat/levels.ts`) — it is listed
 * here only so a mode selector can enumerate it alongside the opt-in ones. */
export type StrategyModeId =
  | "gann"
  | "psarSupertrend"
  | "saraStrat"
  | "maCrossover"
  | "bollinger"
  | "rsiReversal"
  | "macdMomentum";

// User-facing labels — kept off GSPS's internal Gann/Strat vocabulary per
// scripts/check-banned-terms.mjs (docs/GSPS_BRAND_GUIDE.md), even though the
// StrategyModeId keys themselves (internal identifiers) are unchanged.
export const STRATEGY_MODE_LABELS: Record<StrategyModeId, string> = {
  gann: "Structural analysis (default)",
  psarSupertrend: "PSAR + Supertrend reversal",
  saraStrat: "Reversal-pattern bar-sequence entry",
  maCrossover: "EMA9/SMA20 crossover (swing)",
  bollinger: "Bollinger Band reversion/breakout (swing)",
  rsiReversal: "RSI 14 reversal (overbought/oversold)",
  macdMomentum: "MACD momentum crossover (swing)",
};

/** Non-Gann modes only — the set a "Strategy mode" picker actually offers as
 * an alternative to the default. */
export const NON_GANN_STRATEGY_MODES: readonly Exclude<StrategyModeId, "gann">[] = [
  "psarSupertrend",
  "saraStrat",
  "maCrossover",
  "bollinger",
  "rsiReversal",
  "macdMomentum",
];

export interface StrategyLevels {
  mode: StrategyModeId;
  direction: StrategyDirection;
  /** Breakout/trigger price at which this strategy's setup is considered armed. */
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  /** "Master"/runner target — the further of the two profit levels. */
  masterTarget: number;
  riskPerShare: number;
  /** Plain-English explanation of why this setup armed, for display next to the levels. */
  rationale: string;
}

/** A strategy module's pure evaluator: closed bars in, an armed setup (or
 * `null` when nothing has armed) out. Every mode takes the same shape so the
 * registry can dispatch on `StrategyModeId` without a mode-specific caller. */
export type StrategyEvaluator = (bars: Bar[]) => StrategyLevels | null;
