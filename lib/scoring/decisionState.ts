/**
 * The decision state a person acts on, typed (review finding D-06,
 * 2026-10-21). The PRD names five: Qualified Long, Qualified Short, Watch,
 * Conflict/Wait and Stand Down. The verdict carries three (Execute, Watch,
 * Reject) plus a direction, and every state is derived from those two, never
 * scored on its own, so no verdict moves.
 *
 * Gann answers Conflict/Wait himself, so it is not a state of its own here:
 * - Both buying points armed, one with the trend and one against it: "never
 *   buck the trend" (never-failing rule 5, *Commodities* pp. 43-45; *Wall
 *   Street Stock Selector* pp. 18-19). The with-trend side is the trade
 *   (`chooseSessionEntry`), and the one set aside is recorded on the scan as
 *   `setAsideEntry`, so "both sides armed" is on the record without being a
 *   reason to wait.
 * - No trend on any chart and nothing armed: "when in doubt, get out, and
 *   don't get in when in doubt" (rule 6). That is Stand Down
 *   (`applyStandAsideHold`, D-05), a Reject.
 *
 * Three questions: (1) Gann, rules 5 and 6 above, Tier A. (2) No periodicity
 * claim, so Dewey's checklist does not apply. (3) Polarity: long and short are
 * two poles of one reading, and the pair resolves to one side (or none), never
 * to a third state between them.
 */

import type { DecisionState, Direction, ScanDecision } from "@/lib/types";

export type { DecisionState };

/** An Execute with no side to take is not qualified, so it reads Stand Down. */
export function decisionStateOf(outputState: ScanDecision["outputState"], direction: Direction): DecisionState {
  if (outputState === "Watch") return "watch";
  if (outputState === "Execute") {
    if (direction === "bullish") return "qualifiedLong";
    if (direction === "bearish") return "qualifiedShort";
  }
  return "standDown";
}

/** The decision with its state attached, read the same way on the live scan and the replay. */
export function withDecisionState(decision: ScanDecision, direction: Direction): ScanDecision {
  return { ...decision, decisionState: decisionStateOf(decision.outputState, direction) };
}
