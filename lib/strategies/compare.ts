/**
 * Every technique against GSPS's plan, the ones that agree with it first
 * (owner, 2026-10-22: "Highlight all the strategies that align with gsps
 * first. All other strategies can get their own s/l, entry and tp1 (no mtp
 * for anything that doesnt align with Gann trade plan).").
 *
 * - A technique that aligns trades GSPS's plan: Gann's entry, stop, TP1 and
 *   MTP, with the technique's reading of those levels beside it. It brings no
 *   levels of its own, since the plan it agrees with already sets them.
 * - Every other technique offers its own entry, stop and TP1, and never an
 *   MTP: the master take profit belongs to Gann's plan alone.
 *
 * "Aligns" means the technique points the plan's way: armed in the plan's
 * direction, or, when it has armed nothing, its current lean agrees with the
 * plan. Armed against the plan never aligns, whatever the lean says. With no
 * Gann plan on the symbol nothing aligns, and every armed technique offers its
 * own levels.
 *
 * None of this reaches GSPS's own verdict: the scan, the score, the gates,
 * the plan and automation read only Gann's pipeline (AGENTS.md "Strategy
 * Modes"). A technique's levels reach an order only when a person picks them
 * on the order ticket, as a Manual Override.
 *
 * Three-question design basis:
 * 1. Gann: the plan the techniques are ranked against is his; the MTP stays
 *    his alone, because his plan is the only one whose master target comes
 *    from his levels (`lib/strat/levels.ts`). The techniques themselves have
 *    no Gann source, by design.
 * 2. Cycles: no period or recurrence is claimed; Dewey's checklist doesn't
 *    apply.
 * 3. Hermetic: Polarity. Agreement and disagreement are two poles of one
 *    reading, shown together and ordered by the pole that sits with the
 *    plan, rather than hiding the techniques that disagree. Law of Creation:
 *    plan ⊗ technique; when they agree the third is a confirmed plan (same
 *    levels, two readings), when they don't the pair is a mixture and each
 *    keeps its own levels.
 */

import type { PlanInput, PlanReading } from "./explain/types";
import type { StrategyDirection } from "./types";

/** A technique's own trade, offered only when it doesn't align. No MTP, by rule. */
export interface OwnTechniqueLevels {
  direction: StrategyDirection;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  rationale: string;
}

export interface TechniqueRead {
  /** Mode id, or `custom:<scriptId>` for a person's own script. */
  source: string;
  label: string;
  /** Points the plan's way, so it trades GSPS's plan (MTP included). */
  aligned: boolean;
  /** The direction the technique has armed in, if any. */
  armedDirection: StrategyDirection | null;
  /** Its reading of GSPS's plan; null with no plan or too few bars. */
  reading: PlanReading | null;
  /** Its own entry, stop and TP1. Always null when it aligns. */
  ownLevels: OwnTechniqueLevels | null;
}

/** What a technique armed on its own bars: a built-in mode's levels or a
 * script's (a signal-only script has no prices). Any MTP it computed is dropped here. */
export interface ArmedTechnique {
  direction: StrategyDirection;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  rationale: string;
}

function ownLevelsOf(armed: ArmedTechnique): OwnTechniqueLevels | null {
  const { direction, entry, stopLoss, takeProfit1, rationale } = armed;
  if (entry == null || stopLoss == null || takeProfit1 == null) return null;
  if (![entry, stopLoss, takeProfit1].every((n) => Number.isFinite(n) && n > 0)) return null;
  const d = direction === "bullish" ? 1 : -1;
  // A stop or TP1 on the wrong side of the entry is no trade.
  if (d * (entry - stopLoss) <= 0 || d * (takeProfit1 - entry) <= 0) return null;
  return { direction, entry, stopLoss, takeProfit1, rationale };
}

export function alignsWithPlan(
  plan: PlanInput | null,
  armed: ArmedTechnique | null,
  reading: PlanReading | null,
): boolean {
  if (!plan) return false;
  if (armed) return armed.direction === plan.direction;
  return reading?.agrees === true;
}

export function readTechnique(
  source: string,
  label: string,
  plan: PlanInput | null,
  armed: ArmedTechnique | null,
  reading: PlanReading | null,
): TechniqueRead {
  const aligned = alignsWithPlan(plan, armed, reading);
  return {
    source,
    label,
    aligned,
    armedDirection: armed?.direction ?? null,
    reading,
    ownLevels: aligned || !armed ? null : ownLevelsOf(armed),
  };
}

/**
 * The techniques that align first, then those offering their own levels, then
 * the rest (nothing armed, no lean the plan's way). Stable within each group,
 * so the caller's order (the registry's, then the person's scripts) holds.
 */
export function rankTechniques(reads: TechniqueRead[]): TechniqueRead[] {
  const rank = (r: TechniqueRead) => (r.aligned ? 0 : r.ownLevels ? 1 : 2);
  return reads
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}
