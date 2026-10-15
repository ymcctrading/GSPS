/**
 * The mandatory entry-confirmation rule, per the "GSPS Implementation
 * Brief" single-source-of-truth spec pack (2026-08-31):
 *
 * "Price commonly breaks above or below an entry level before returning.
 * That initial move is a setup-state observation — not an executable
 * entry." An indicator flip, initial touch, initial break, or initial
 * sweep alone can never produce an entry. The spec states this for every
 * surface, and GSPS applies it on every surface (owner decision 4,
 * 2026-09-27, and the owner's follow-up that automation adheres to the same
 * rules as everything else):
 *
 *   - Every entry that carries the protocol's levels is placed only once
 *     confirmed on closed execution-timeframe bars, checked in one place,
 *     `lib/trade/place-order.ts` via `lib/lifecycle/confirmNow.ts`: the
 *     manual ticket's advised entry, Guided Mode, the demo account, and
 *     plan-scoped automation (which the autonomous portfolio manager runs
 *     through). Automation's plans must also be `armed`, which
 *     `lib/lifecycle/transitions.ts`'s `arm` event refuses without
 *     `entryReady`; the placement check re-reads the real closed bars.
 *   - The measured reason: the stop entry lost (−0.155R on 2026-09-26,
 *     −0.052R on 2026-09-27) and the confirmed entry won (+0.190R both runs)
 *     on the full universe (docs/replay-runs/2026-09-26-766sym-NOTES.md).
 *   - The backtest measures both rules through the same function:
 *     `lib/backtest/replay.ts`'s `entryRule` option (`"stop"` or
 *     `"confirmed"`) calls `advanceEntryConfirmation` directly.
 *
 * Versioned rule (v1, "breakout-retest-hold" / "breakdown-retest-fail" —
 * the spec explicitly allows other versioned setup rules; this is GSPS's
 * default and the only one implemented today):
 *
 *   entry_zone_touched     price reaches the plan's entry trigger
 *   break_or_sweep_detected a later bar CLOSES beyond the trigger *by at
 *                           least `confirmationBufferPct`*, in direction (a
 *                           same-bar close doesn't count — that would let
 *                           touch and break collapse into one event)
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
 *
 * **The break stage's buffer.** Gann's 3-point rule says a break of an old
 * level must clear it by 3 points before it's trusted (W006 pp.20–24, 46–47;
 * *New Stock Trend Detector* p. 20). From 2026-09-16 this stage asked for a
 * close 0.3% beyond the trigger, on top of a trigger that was itself 0.3%
 * beyond the level. From 2026-10-15 (owner: "Use Gann's full 3 points now";
 * PLAN.md item 3) the full, price-scaled 3 points live in the trigger price
 * (`lib/gann/entryTrigger.ts`, `lib/gann/pointScale.ts`), so the default
 * buffer here is zero: a close beyond the trigger *is* a close 3 points
 * beyond the old top. Adding the allowance again would ask for 6 points,
 * which Gann never does. A caller whose trigger is not already a 3-point
 * crossing can pass its own `confirmationBufferPct` (the intraday replay does).
 *
 * **Gann's reaction rule (PLAN.md item 4, 2026-10-15).** Every production
 * caller now passes the plan's stop, which selects his own rule: old top 50,
 * a close at 53 crosses it, buy the reaction at 51, stop at 47 (W006 pp.20,
 * 46-47). The plan's entry is the level plus 1 point and its stop the level
 * less 3, so the crossing line is recovered from the two (`gannBreakLine`).
 * The entry is ready on the closing break; the order then rests as a limit at
 * the entry and the reaction fills it. The four-stage sequence above remains
 * for the replay's `"confirmed"` rule, so the two can be measured side by side.
 */

import type { Bar } from "@/lib/types";
import type { EntryConfirmationEvidence } from "./types";
import { EMPTY_ENTRY_CONFIRMATION } from "./types";
import { gannBreakLine } from "@/lib/gann/entryTrigger";

export type ConfirmationDirection = "bullish" | "bearish";

/**
 * Default break-stage buffer as a percentage of the entry trigger price.
 * Zero, because the trigger already carries Gann's 3 points — see "The break
 * stage's buffer" above. Applied when a rule doesn't specify its own
 * `confirmationBufferPct`.
 */
export const DEFAULT_CONFIRMATION_BUFFER_PCT = 0;

export interface EntryConfirmationRule {
  direction: ConfirmationDirection;
  entryTrigger: number;
  /** Percentage of `entryTrigger` the break stage must clear by. Defaults to `DEFAULT_CONFIRMATION_BUFFER_PCT`. */
  confirmationBufferPct?: number;
  /**
   * The plan's stop. When given, the rule is Gann's reaction buy (PLAN.md
   * item 4, W006 pp.20, 46-47) rather than the retest-and-hold sequence:
   * `entryTrigger` is the level plus 1 point, this stop the level less 3,
   * and the entry is ready once a closed bar closes at or past the level plus
   * 3 points (`gannBreakLine`). The order then rests as a limit at
   * `entryTrigger` and fills on the reaction. Every production path passes
   * it; the replay's `"confirmed"` rule and the intraday replay don't, so
   * the older sequence can still be measured.
   */
  stopPrice?: number;
  /**
   * With `stopPrice`: `oldLevel` is Gann's double or triple bottom (PLAN.md
   * item 5, step 2), a resting order at the level itself with nothing to
   * arm, so it is ready on the first bar that hasn't closed through the stop.
   * Absent or `crossing` is the reaction after a crossing.
   */
  entryKind?: "crossing" | "oldLevel";
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

  if (rule.stopPrice != null && rule.entryKind === "oldLevel") {
    // The order rests at the old bottom from the start: nothing to cross. A
    // close through the stop first breaks the level, and it never arms after
    // that, as the placement check reads it (`confirmationFromBars`).
    if (next.entryConfirmedAt == null && next.stopClosedAt == null) {
      if (up ? bar.c > rule.stopPrice : bar.c < rule.stopPrice) {
        next = { ...next, touchedAt: bar.t, touchedPrice: bar.c, breakOrSweepAt: bar.t, breakOrSweepPrice: bar.c, entryConfirmedAt: bar.t };
      } else {
        next = { ...next, stopClosedAt: bar.t };
      }
    }
    return next;
  }

  if (rule.stopPrice != null) {
    // Gann's crossing: the touch and the closing break may be the same bar,
    // since "a close at 53 crosses 50" is one event. Once broken, the entry
    // is ready: the reaction is bought with a resting limit, not here.
    const line = gannBreakLine(trigger, rule.stopPrice);
    if (next.touchedAt == null && (up ? bar.h >= line : bar.l <= line)) {
      next = { ...next, touchedAt: bar.t, touchedPrice: up ? bar.h : bar.l };
    }
    if (next.touchedAt != null && next.breakOrSweepAt == null && (up ? bar.c >= line : bar.c <= line)) {
      next = { ...next, breakOrSweepAt: bar.t, breakOrSweepPrice: bar.c, entryConfirmedAt: bar.t };
    }
    return next;
  }

  // Stage 1: entry-zone touch. Range-based — a wick reaching the level
  // counts, since this stage explicitly does NOT gate an order.
  if (next.touchedAt == null) {
    const touched = up ? bar.h >= trigger : bar.l <= trigger;
    if (touched) {
      next = { ...next, touchedAt: bar.t, touchedPrice: up ? bar.h : bar.l };
    }
  }

  // Stage 2: break/sweep. Requires a CLOSE beyond the trigger (which already
  // carries Gann's 3 points; see header), on a bar strictly after the touch bar.
  if (next.touchedAt != null && next.breakOrSweepAt == null && bar.t > next.touchedAt) {
    const bufferPct = rule.confirmationBufferPct ?? DEFAULT_CONFIRMATION_BUFFER_PCT;
    const bufferedTrigger = up ? trigger * (1 + bufferPct / 100) : trigger * (1 - bufferPct / 100);
    const broke = up ? bar.c > bufferedTrigger : bar.c < bufferedTrigger;
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
  // Gann's reaction rule confirms on the break alone (its limit order waits
  // for the reaction); the retest-and-hold rule needs all four stages. Each
  // rule sets `entryConfirmedAt` only when its own sequence is complete.
  return (
    evidence.touchedAt != null &&
    evidence.breakOrSweepAt != null &&
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
