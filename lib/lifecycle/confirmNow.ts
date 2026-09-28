/**
 * Has the entry been confirmed yet, on the market as it is now?
 *
 * Owner decision 4 (2026-09-27): entry confirmation holds on every path a
 * plan can be entered through, not only unattended automation. The measured
 * reason: on the full universe the confirmed entry beat the resting
 * stop-entry (+0.190R vs −0.155R on 2026-09-26; +0.190R vs −0.052R on the
 * 2026-09-27 swing-chart run). A person approves the trade; the fill rule is
 * what decides whether it makes money.
 *
 * Every entry that carries the protocol's levels passes through it just
 * before placing (`lib/trade/place-order.ts`): the manual ticket's advised
 * entry, Guided Mode, the demo account, and plan-scoped automation (which the
 * autonomous portfolio manager runs through). One rule for all of them.
 *
 * It runs the same state machine the plans and the replay use
 * (`replayEntryConfirmation`) over closed execution-timeframe bars (today's
 * session, or since the plan was generated for a plan-sourced order):
 * touch, a close beyond the trigger by the 3-point-rule buffer, a retest,
 * then a close that holds. Only when all four have happened does the order
 * go in. The replay's confirmed rule also counts only bars from the session
 * the trigger is armed on, so the two read the same window.
 *
 * Three-question basis:
 * 1. Gann: the break stage's buffer is his 3-point rule (*New Stock Trend
 *    Detector*, A5); the retest-and-hold is his "should not react back under
 *    the old top" read on the execution chart (A05 p. 20).
 * 2. Cycles: no periodicity claim, so Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. The order is the effect; the observed
 *    confirmation is the cause it has to wait for.
 */

import type { AssetClass, Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { EXECUTION_TIMEFRAME, TF_INTERVAL_MS } from "@/lib/timeframe";
import { entryReady, replayEntryConfirmation } from "./entryConfirmation";
import type { EntryConfirmationEvidence } from "./types";

export type ConfirmationStage = "not_touched" | "touched" | "broken" | "retested" | "confirmed";

export interface ConfirmationNow {
  ready: boolean;
  stage: ConfirmationStage;
  /** One plain sentence for the person or the log. */
  note: string;
}

export function stageOf(e: EntryConfirmationEvidence): ConfirmationStage {
  if (entryReady(e)) return "confirmed";
  if (e.retestAt) return "retested";
  if (e.breakOrSweepAt) return "broken";
  if (e.touchedAt) return "touched";
  return "not_touched";
}

const NOTES: Record<ConfirmationStage, string> = {
  not_touched: "Price hasn't reached the entry level yet today.",
  touched: "Price reached the entry level but hasn't closed through it yet.",
  broken: "Price closed through the entry level and is waiting for a retest.",
  retested: "Price retested the entry level and is waiting for a close that holds.",
  confirmed: "The entry is confirmed: a close through the level, a retest, and a close that held.",
};

/**
 * The closed bars confirmation is read over, without the one still forming.
 * With `since` (a plan's generation time), every closed bar from then on, the
 * way the replay's confirmed rule counts bars from the session a pivot armed
 * on. Without it, the latest session's bars only.
 */
export function closedSessionBars(bars: Bar[], now: Date, intervalMs: number, since?: string): Bar[] {
  const closed = bars.filter((b) => Date.parse(b.t) + intervalMs <= now.getTime());
  if (closed.length === 0) return [];
  if (since) {
    const from = Date.parse(since);
    return closed.filter((b) => Date.parse(b.t) >= from);
  }
  const day = closed[closed.length - 1].t.slice(0, 10);
  return closed.filter((b) => b.t.slice(0, 10) === day);
}

export function confirmationFromBars(
  bars: Bar[],
  direction: "bullish" | "bearish",
  entryTrigger: number,
): ConfirmationNow {
  const evidence = replayEntryConfirmation({ direction, entryTrigger }, bars);
  const stage = stageOf(evidence);
  return { ready: stage === "confirmed", stage, note: NOTES[stage] };
}

export async function readEntryConfirmationNow(input: {
  symbol: string;
  assetClass: AssetClass;
  direction: "bullish" | "bearish";
  entryTrigger: number;
  /** Count bars from this time (a plan's generation time). Default: today's session. */
  since?: string;
  now?: Date;
}): Promise<ConfirmationNow> {
  const now = input.now ?? new Date();
  const intervalMs = TF_INTERVAL_MS[EXECUTION_TIMEFRAME];
  const fourDays = now.getTime() - 4 * 24 * 3600 * 1000;
  const sinceMs = input.since ? Date.parse(input.since) : NaN;
  const start = new Date(Number.isFinite(sinceMs) ? Math.min(sinceMs, fourDays) : fourDays);
  const bars = await getMarketDataProvider().fetchBars(input.symbol, EXECUTION_TIMEFRAME, start, null, input.assetClass);
  return confirmationFromBars(
    closedSessionBars(bars, now, intervalMs, input.since),
    input.direction,
    input.entryTrigger,
  );
}
