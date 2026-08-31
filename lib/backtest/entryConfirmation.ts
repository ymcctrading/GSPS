/**
 * Entry-confirmation parity for backtesting/forward testing, per the
 * spec's "use the same frozen signal, plan, entry-confirmation, and
 * strategy-module engine in scans, backtests, and forward tests."
 *
 * This calls `replayEntryConfirmation` from
 * `lib/lifecycle/entryConfirmation.ts` directly — the exact function the
 * live scan pipeline uses bar-by-bar (`lib/lifecycle/advanceConfirmation.ts`)
 * — rather than re-implementing the break/retest/confirmation-move rule a
 * second time for backtesting. A backtest result and a live plan can never
 * drift on what counts as a confirmed entry, because there is only one
 * implementation of that rule in the codebase.
 *
 * Deliberately additive: `lib/backtest/replay.ts` is a separate, already-
 * calibrated harness for the older Gann/STRAT pattern engine (see its own
 * header and docs/REPLAY_RESULTS*.md) and is untouched here. This module
 * is for backtesting/forward-testing setups sourced from the newer
 * lifecycle/entry-confirmation pipeline (lib/lifecycle/fromScanResult.ts),
 * which `lib/backtest/replay.ts` does not model at all.
 */

import type { Bar } from "@/lib/types";
import {
  advanceEntryConfirmation,
  entryReady,
  freshEntryConfirmation,
  type ConfirmationDirection,
} from "@/lib/lifecycle/entryConfirmation";
import type { EntryConfirmationEvidence } from "@/lib/lifecycle/types";

export interface EntryConfirmationBacktestCase {
  symbol: string;
  direction: ConfirmationDirection;
  entryTrigger: number;
  /** Historical bars starting at or after the signal's generatedAt, in chronological order. */
  bars: readonly Bar[];
}

export interface EntryConfirmationBacktestResult {
  symbol: string;
  confirmed: boolean;
  barsToConfirm: number | null;
  evidence: EntryConfirmationEvidence;
}

/**
 * Replays one historical setup through the confirmation state machine and
 * reports whether — and how many bars after the signal — it would have
 * become an executable entry. `barsToConfirm` counts bars consumed from
 * `bars[0]`, so a strategy report can bucket "how long confirmation
 * typically takes" the same way it already buckets time-in-trade.
 */
export function backtestEntryConfirmation(
  input: EntryConfirmationBacktestCase,
): EntryConfirmationBacktestResult {
  const rule = { direction: input.direction, entryTrigger: input.entryTrigger };
  let evidence = freshEntryConfirmation();
  let barsToConfirm: number | null = null;

  for (let i = 0; i < input.bars.length; i++) {
    evidence = advanceEntryConfirmation(evidence, rule, input.bars[i]);
    if (entryReady(evidence)) {
      barsToConfirm = i + 1;
      break;
    }
  }

  return {
    symbol: input.symbol,
    confirmed: entryReady(evidence),
    barsToConfirm,
    evidence,
  };
}

/** Aggregate confirmation-rate/timing stats across a batch of setups — the report a strategy review reads. */
export function summarizeEntryConfirmationBacktest(
  results: readonly EntryConfirmationBacktestResult[],
): { total: number; confirmedCount: number; confirmationRate: number; medianBarsToConfirm: number | null } {
  const total = results.length;
  const confirmed = results.filter((r) => r.confirmed);
  const barsToConfirm = confirmed
    .map((r) => r.barsToConfirm)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const medianBarsToConfirm =
    barsToConfirm.length === 0 ? null : barsToConfirm[Math.floor(barsToConfirm.length / 2)];

  return {
    total,
    confirmedCount: confirmed.length,
    confirmationRate: total === 0 ? 0 : confirmed.length / total,
    medianBarsToConfirm,
  };
}
