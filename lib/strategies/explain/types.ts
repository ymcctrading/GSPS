/**
 * Explain-the-math types (owner decision 2026-10-16: "Gann's method is still
 * how we plot the chart; the indicator of choice will just [be] how we explain
 * the math on the front end").
 *
 * An explainer takes GSPS's own plan (Gann's levels, never a mode's) and the
 * closed bars, and returns words about what the chosen technique reads at each
 * of those levels. It has no output that can become an entry, stop, target,
 * score, gate or order: `PlanReading` carries text and the plan's own prices
 * only. See AGENTS.md's "Strategy Modes" section and
 * docs/STRATEGY_MODES.md.
 *
 * Three-question design basis:
 * 1. Gann: no new source needed. Gann's rules set every level; this only reads
 *    the levels his rules produced.
 * 2. Cycles: no period or recurrence is claimed, so Dewey's checklist doesn't
 *    apply. The indicator lookbacks are smoothing windows.
 * 3. Hermetic: Correspondence, one structure described in a second vocabulary
 *    the trader already knows.
 */

import type { StrategyDirection } from "../types";

/** GSPS's own plan, as the scan produced it. A target the plan doesn't fix
 * (an intraday alert may have no TP1 or MTP) is null and gets no line. */
export interface PlanInput {
  direction: StrategyDirection;
  entry: number;
  stopLoss: number;
  takeProfit1: number | null;
  masterTarget: number | null;
}

export type PlanLevelKey =
  "entry" | "stopLoss" | "takeProfit1" | "masterTarget";

export interface PlanLevelReading {
  level: PlanLevelKey;
  /** The plan's own price, rounded to cents. Never a technique's level. */
  price: number;
  text: string;
}

export interface PlanReading {
  /** Mode id, or `custom:<scriptId>` for a user's script. */
  source: string;
  /** User-facing name of the technique that produced this reading. */
  label: string;
  /** Whether the technique leans the plan's way. `null` when it is neutral or split. */
  agrees: boolean | null;
  /** One sentence: the technique's current state and its lean. */
  summary: string;
  levels: PlanLevelReading[];
}

export type PlanExplainer = (
  bars: import("@/lib/types").Bar[],
  plan: PlanInput,
) => PlanReading | null;
