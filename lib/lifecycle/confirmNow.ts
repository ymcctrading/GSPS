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
 * session, or since the plan was generated for a plan-sourced order). Since
 * PLAN.md item 4 that is Gann's crossing rule: a close 3 points past the old
 * level makes the entry ready, and the order rests as a limit at the plan's
 * entry for the reaction. A later close through the stop calls it off. The
 * replay's reaction rule counts bars from the session the trigger is armed
 * on, so the two read the same window.
 *
 * Three-question basis:
 * 1. Gann: a close 3 points past an old top crosses it, and the buy is on
 *    the reaction 1 point above it with the stop 3 points below (W006 pp.20,
 *    46-47; *New Stock Trend Detector*, A5).
 * 2. Cycles: no periodicity claim, so Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. The order is the effect; the observed
 *    confirmation is the cause it has to wait for.
 */

import type { AssetClass, Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { EXECUTION_TIMEFRAME, TF_INTERVAL_MS } from "@/lib/timeframe";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
import { etDateKey } from "@/lib/market/session";
import { entryChart } from "@/lib/scan/entrySelection";
import { entryReady, replayEntryConfirmation } from "./entryConfirmation";
import type { EntryConfirmationEvidence } from "./types";

export type ConfirmationStage = "not_touched" | "touched" | "broken" | "retested" | "confirmed" | "dead";

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
  dead: "Price closed through the stop, so this entry is off until a new setup forms.",
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

/** The same stages read under Gann's reaction rule (PLAN.md item 4). */
const GANN_NOTES: Record<ConfirmationStage, string> = {
  not_touched: "Price hasn't crossed the old level by 3 points yet.",
  touched: "Price reached 3 points past the old level but hasn't closed there yet.",
  broken: "Price closed 3 points past the old level.",
  retested: "Price closed 3 points past the old level.",
  confirmed: "Price closed 3 points past the old level, so the entry rests as a limit for the reaction.",
  dead: "Price closed through the stop after the crossing, so this entry is off until a new setup forms.",
};

const OLD_LEVEL_NOTES = {
  confirmed: "The entry rests at the old level, where a second or third test makes the double or triple bottom (top, for a short).",
  dead: "Price closed through the stop under the old level, so this entry is off until a new setup forms.",
} as const;

/**
 * With `stopPrice`, Gann's reaction rule: ready once a closed bar has closed
 * 3 points past the old level, and off ("dead") once a later close goes
 * through the stop (W006 p.20: the stop is 3 points the other side of the
 * level). Without it, the retest-and-hold sequence.
 */
export function confirmationFromBars(
  bars: Bar[],
  direction: "bullish" | "bearish",
  entryTrigger: number,
  stopPrice?: number,
  entryKind?: "crossing" | "oldLevel",
): ConfirmationNow {
  if (stopPrice != null && entryKind === "oldLevel") {
    // Gann's double or triple bottom (PLAN.md item 5, step 2): the order rests
    // at the old bottom with nothing to cross first. Off once a close has gone
    // through the stop.
    const up = direction === "bullish";
    const dead = bars.some((b) => (up ? b.c <= stopPrice : b.c >= stopPrice));
    return dead ? { ready: false, stage: "dead", note: OLD_LEVEL_NOTES.dead } : { ready: true, stage: "confirmed", note: OLD_LEVEL_NOTES.confirmed };
  }
  const evidence = replayEntryConfirmation({ direction, entryTrigger, stopPrice }, bars);
  let stage = stageOf(evidence);
  if (stopPrice != null && stage === "confirmed" && evidence.breakOrSweepAt) {
    const up = direction === "bullish";
    const after = bars.filter((b) => b.t > evidence.breakOrSweepAt!);
    if (after.some((b) => (up ? b.c <= stopPrice : b.c >= stopPrice))) stage = "dead";
  }
  const notes = stopPrice != null ? GANN_NOTES : NOTES;
  return { ready: stage === "confirmed", stage, note: notes[stage] };
}

export async function readEntryConfirmationNow(input: {
  symbol: string;
  assetClass: AssetClass;
  direction: "bullish" | "bearish";
  entryTrigger: number;
  /** The plan's stop: selects Gann's reaction rule (see `confirmationFromBars`). */
  stopPrice?: number;
  /** Which of Gann's buying points; `oldLevel` has nothing to cross. */
  entryKind?: "crossing" | "oldLevel";
  /**
   * Count bars from this time (a plan's generation time). Default: today's
   * session, or the last four days under Gann's rule.
   */
  since?: string;
  now?: Date;
}): Promise<ConfirmationNow> {
  const now = input.now ?? new Date();
  const intervalMs = TF_INTERVAL_MS[EXECUTION_TIMEFRAME];
  const fourDays = now.getTime() - 4 * 24 * 3600 * 1000;
  const sinceMs = input.since ? Date.parse(input.since) : NaN;
  const start = new Date(Number.isFinite(sinceMs) ? Math.min(sinceMs, fourDays) : fourDays);
  const bars = await getMarketDataProvider().fetchBars(input.symbol, EXECUTION_TIMEFRAME, start, null, input.assetClass);
  // Gann's crossing can close on one day and the reaction come the next, and
  // a plan is often generated after the crossing it buys (PLAN.md item 5,
  // defect 2). So his rule reads every closed bar fetched: the last four days,
  // or from the plan's generation time when that is earlier. A later close
  // through the stop calls it off. The four days is an engineering choice,
  // not a figure from Gann. The retest-and-hold sequence keeps today's
  // session, or the bars since the plan.
  const window =
    input.stopPrice != null
      ? bars.filter((b) => Date.parse(b.t) + intervalMs <= now.getTime() && Date.parse(b.t) >= start.getTime())
      : closedSessionBars(bars, now, intervalMs, input.since);
  const read = confirmationFromBars(window, input.direction, input.entryTrigger, input.stopPrice, input.entryKind);
  if (input.stopPrice == null || input.entryKind === "oldLevel" || read.ready || read.stage === "dead") return read;
  // The daily chart below leaves out the day still forming, so a close
  // through the stop in the bars above (today's included) ends it here.
  const stop = input.stopPrice;
  const up = input.direction === "bullish";
  if (window.some((b) => (up ? b.c <= stop : b.c >= stop))) return { ready: false, stage: "dead", note: GANN_NOTES.dead };

  // A reaction can run longer than the window above, so the crossing may be
  // older than every bar fetched. The completed daily chart is where the scan
  // found the level: if it still holds there (crossed, not broken, not yet
  // bought) and it is the level this order buys, the entry is ready.
  // The monthly chart holds the older levels the scan also reads (step 3).
  const year = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  const decade = new Date(now.getTime() - 10 * 365.25 * 24 * 3600 * 1000);
  const provider = getMarketDataProvider();
  const [daily, monthly] = await Promise.all([
    provider.fetchBars(input.symbol, "1Day", year, null, input.assetClass),
    provider.fetchBars(input.symbol, "1Month", decade, null, input.assetClass),
  ]);
  return heldOnDailyChart(daily, now, input.direction, input.entryTrigger, monthly)
    ? { ready: true, stage: "confirmed", note: GANN_NOTES.confirmed }
    : read;
}

/**
 * Whether the completed daily bars hold a crossed level whose reaction buy is
 * this entry (to the cent, or 0.1% on a large price). The bar still forming
 * is left out, so an unfinished day can neither cross nor break the level.
 */
export function heldOnDailyChart(
  daily: Bar[],
  now: Date,
  direction: "bullish" | "bearish",
  entry: number,
  monthly: Bar[] = [],
): boolean {
  // The scan's own window: the 52 weeks of sessions before today, and the
  // older levels on the monthly chart.
  const chart = entryChart(daily, monthly, etDateKey(now));
  const trigger = computeGannEntryTrigger(chart.bars, direction, undefined, undefined, true, chart.older);
  if (!trigger?.held) return false;
  return Math.abs(trigger.reactionEntry - entry) <= Math.max(0.01, entry * 0.001);
}
