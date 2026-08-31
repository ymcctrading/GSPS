/**
 * The mandatory entry-confirmation rule, per the "GSPS Implementation
 * Brief" single-source-of-truth spec pack (2026-08-31):
 *
 * "Price commonly breaks above or below an entry level before returning.
 * That initial move is a setup-state observation — not an executable
 * entry." An indicator flip, initial touch, initial break, or initial
 * sweep alone can never produce an entry. This applies uniformly to
 * user-facing trade suggestions, backtesting, forward testing, paper
 * orders, and live automated orders — every caller runs bars through
 * `advanceEntryConfirmation` and gates on `entryReady`, so scan, backtest
 * and live execution can never drift apart on what counts as confirmed.
 *
 * Versioned rule (v1, "breakout-retest-hold" / "breakdown-retest-fail" —
 * the spec explicitly allows other versioned setup rules; this is GSPS's
 * default and the only one implemented today):
 *
 *   entry_zone_touched     price reaches the plan's entry trigger
 *   break_or_sweep_detected a later bar CLOSES beyond the trigger, in
 *                           direction (a same-bar close doesn't count —
 *                           that would let touch and break collapse into
 *                           one event)
 *   return_or_retest_detected a later bar's range returns to/through the
 *                           entry trigger after the break
 *   confirmation_move_validated a later CLOSED bar resumes beyond the
 *                           retest bar's own extreme (the structural
 *                           "held the retest" confirmation)
 *   entry_confirmed         all four stages populated, in order
 *
 * Each stage requires a bar strictly after the prior stage's bar — a single
 * bar cannot satisfy two stages, matching "an indicator flip ... alone
 * cannot produce an entry."
 */

import type { Bar } from "@/lib/types";
import type { EntryConfirmationEvidence } from "./types";
import { EMPTY_ENTRY_CONFIRMATION } from "./types";

export type ConfirmationDirection = "bullish" | "bearish";

export interface EntryConfirmationRule {
  direction: ConfirmationDirection;
  entryTrigger: number;
}

/**
 * Runs one additional bar through the evidence state machine. Idempotent
 * and order-independent per call site as long as `bars` is fed in
 * chronological order — replaying the same bar twice is a no-op once a
 * stage is already populated, since each branch only fires from the
 * immediately-preceding stage.
 */
export function advanceEntryConfirmation(
  evidence: EntryConfirmationEvidence,
  rule: EntryConfirmationRule,
  bar: Bar,
): EntryConfirmationEvidence {
  const up = rule.direction === "bullish";
  const trigger = rule.entryTrigger;

  let next = evidence;

  // Stage 1: entry-zone touch. Range-based — a wick reaching the level
  // counts, since this stage explicitly does NOT gate an order.
  if (next.touchedAt == null) {
    const touched = up ? bar.h >= trigger : bar.l <= trigger;
    if (touched) {
      next = { ...next, touchedAt: bar.t, touchedPrice: up ? bar.h : bar.l };
    }
  }

  // Stage 2: break/sweep. Requires a CLOSE beyond the trigger, on a bar
  // strictly after the touch bar.
  if (next.touchedAt != null && next.breakOrSweepAt == null && bar.t > next.touchedAt) {
    const broke = up ? bar.c > trigger : bar.c < trigger;
    if (broke) {
      next = { ...next, breakOrSweepAt: bar.t, breakOrSweepPrice: bar.c };
    }
  }

  // Stage 3: return/retest. Range-based — price coming back to/through the
  // trigger after having broken beyond it, on a bar strictly after the
  // break bar.
  if (
    next.breakOrSweepAt != null &&
    next.retestAt == null &&
    bar.t > next.breakOrSweepAt
  ) {
    const retested = up ? bar.l <= trigger : bar.h >= trigger;
    if (retested) {
      next = { ...next, retestAt: bar.t, retestPrice: up ? bar.l : bar.h };
    }
  }

  // Stage 4: confirmation move. Requires a CLOSE beyond the retest bar's
  // own extreme, on a bar strictly after the retest bar — the "held" close
  // that turns a retest into a confirmed reclaim/rejection.
  if (
    next.retestAt != null &&
    next.confirmationMoveAt == null &&
    bar.t > next.retestAt &&
    next.retestPrice != null
  ) {
    const confirmed = up ? bar.c > next.retestPrice : bar.c < next.retestPrice;
    if (confirmed) {
      next = {
        ...next,
        confirmationMoveAt: bar.t,
        confirmationMovePrice: bar.c,
        entryConfirmedAt: bar.t,
      };
    }
  }

  return next;
}

/**
 * The hard server-side gate. Mirrors the spec's `entryReady` const exactly:
 * directional bias, zone proximity, break/sweep, and retest can never allow
 * an order on their own — only a fully populated confirmation sequence,
 * plus freshness/expiry (checked by the caller against `plan.expiresAt` and
 * `plan.state`, which this function doesn't have), does.
 */
export function entryReady(evidence: EntryConfirmationEvidence): boolean {
  return (
    evidence.touchedAt != null &&
    evidence.breakOrSweepAt != null &&
    evidence.retestAt != null &&
    evidence.confirmationMoveAt != null &&
    evidence.entryConfirmedAt != null
  );
}

/** Convenience for callers building a fresh plan — no confirmation evidence yet. */
export function freshEntryConfirmation(): EntryConfirmationEvidence {
  return { ...EMPTY_ENTRY_CONFIRMATION };
}

/**
 * Runs a full bar series through the state machine in one call — the shape
 * both `lib/entitlements/scan-fanout.ts` (one new bar per scan) and
 * `lib/backtest/replay.ts` (a whole historical series) need, so both use
 * this instead of re-deriving the loop.
 */
export function replayEntryConfirmation(
  rule: EntryConfirmationRule,
  bars: readonly Bar[],
): EntryConfirmationEvidence {
  let evidence = freshEntryConfirmation();
  for (const bar of bars) {
    evidence = advanceEntryConfirmation(evidence, rule, bar);
    if (entryReady(evidence)) break;
  }
  return evidence;
}
