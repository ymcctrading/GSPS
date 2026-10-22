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
 * level crosses it, and since never-failing rule 9 (2026-10-16) the entry is
 * ready once a later closed bar has reacted into the buying zone (the plan's
 * entry down to 1 point short of the stop, `gannBuyZone`). Placement then
 * sends it at the market; no limit rests at a fixed price ("Never limit your
 * orders or fix a buying or selling price. Trade at the market", Commodities
 * rule 9, pp.43-45, and p.19). A double or triple bottom is ready once a
 * closed bar has come back to the old level, and a bottom that held once one
 * has traded at its last close. A later close through the stop calls any of
 * them off. The replay's reaction rule counts bars from the session the
 * trigger is armed on, and fills at the next bar's open, so the two read the
 * same window.
 *
 * Three-question basis:
 * 1. Gann: a close 3 points past an old top crosses it, and the buy is on
 *    the reaction 1 point above it with the stop 3 points below (W006 pp.20,
 *    46-47; *New Stock Trend Detector*, A5), at the market (never-failing
 *    rule 9, Commodities pp.43-45 and p.19).
 * 2. Cycles: no periodicity claim, so Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. The order is the effect; the observed
 *    confirmation is the cause it has to wait for.
 */

import { readDistributionStanding } from "@/lib/gann/distribution";
import { failedTestInPath, readMultipleTops } from "@/lib/gann/multipleTops";
import type { AssetClass, Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { EXECUTION_TIMEFRAME, TF_INTERVAL_MS } from "@/lib/timeframe";
import { computeGannEntryTrigger, gannBreakLine, tradedIntoBuyZone } from "@/lib/gann/entryTrigger";
import { breakawayVolumeMet } from "@/lib/gann/breakaway";
import { restsWithoutCrossing, type GannEntryKind } from "@/lib/gann/entryKind";
import { etDateKey } from "@/lib/market/session";
import { entryChart, entryChartBars, monthlyChartFrom } from "@/lib/scan/entrySelection";
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

/** The same stages read under Gann's reaction rule (PLAN.md item 4) and rule 9. */
const AWAITING_REACTION_NOTE =
  "Price closed 3 points past the old level, so the entry waits for a bar to react back into the buying zone, then goes at the market.";
const GANN_NOTES: Record<ConfirmationStage, string> = {
  not_touched: "Price hasn't crossed the old level by 3 points yet.",
  touched: "Price reached 3 points past the old level but hasn't closed there yet.",
  broken: AWAITING_REACTION_NOTE,
  retested: AWAITING_REACTION_NOTE,
  confirmed: "Price closed 3 points past the old level and a later bar reacted into the buying zone, so the entry goes at the market.",
  dead: "Price closed through the stop after the crossing, so this entry is off until a new setup forms.",
};

const OLD_LEVEL_NOTES = {
  waiting: "The entry waits for price to come back to the old level, where a second or third test makes the double or triple bottom (top, for a short), then goes at the market.",
  confirmed: "Price came back to the old level, where a second or third test makes the double or triple bottom (top, for a short), so the entry goes at the market.",
  dead: "Price closed through the stop under the old level, so this entry is off until a new setup forms.",
} as const;

// A short at the close is a top that held or a rally sold at the end of its
// week, so its notes name the high the stop is over, not a low (step 4b R4).
const HOLD_NOTES = {
  waiting: "The low has held, and the entry waits for price to trade back to the last close, then goes at the market.",
  confirmed: "The low has held and price traded at the last close, so the entry goes at the market with the stop 3 points under the low.",
  dead: "Price closed through the stop under the low that held, so this entry is off until a new setup forms.",
} as const;

const HOLD_SHORT_NOTES = {
  waiting: "The sell waits for price to trade back up to the last close, then goes at the market, with the stop 3 points over the high.",
  confirmed: "Price traded at the last close, so the sell goes at the market, with the stop 3 points over the high.",
  dead: "Price closed through the stop over the high, so this entry is off until a new setup forms.",
} as const;

/**
 * With `stopPrice`, Gann's reaction rule: ready once a closed bar has closed
 * 3 points past the old level and a later closed bar has traded into the
 * buying zone (never-failing rule 9: the entry then goes at the market), and
 * off ("dead") once a later close goes through the stop (W006 p.20: the stop
 * is 3 points the other side of the level). Without it, the retest-and-hold
 * sequence.
 */
export function confirmationFromBars(
  bars: Bar[],
  direction: "bullish" | "bearish",
  entryTrigger: number,
  stopPrice?: number,
  entryKind?: GannEntryKind,
  cancelBeyond?: number,
): ConfirmationNow {
  if (stopPrice != null && cancelBeyond != null) return rebuyFromBars(bars, direction, entryTrigger, stopPrice, cancelBeyond);
  if (stopPrice != null && restsWithoutCrossing(entryKind)) {
    // Gann's double or triple bottom (PLAN.md item 5, step 2), or a bottom
    // that has held (step 4): the order rests with nothing to cross first.
    // Off once a close has gone through the stop.
    // Off once a close has gone through the stop; ready (at the market) once
    // a closed bar has come back to the entry (rule 9).
    const up = direction === "bullish";
    const dead = bars.some((b) => (up ? b.c <= stopPrice : b.c >= stopPrice));
    const notes = entryKind !== "hold" ? OLD_LEVEL_NOTES : up ? HOLD_NOTES : HOLD_SHORT_NOTES;
    if (dead) return { ready: false, stage: "dead", note: notes.dead };
    return bars.some((b) => tradedIntoBuyZone(b, direction, entryTrigger))
      ? { ready: true, stage: "confirmed", note: notes.confirmed }
      : { ready: false, stage: "not_touched", note: notes.waiting };
  }
  const evidence = replayEntryConfirmation({ direction, entryTrigger, stopPrice }, bars);
  let stage = stageOf(evidence);
  if (stopPrice != null && stage === "confirmed" && evidence.breakOrSweepAt) {
    const up = direction === "bullish";
    // Only bars after the crossing close: the crossing bar's own low came first.
    const after = bars.filter((b) => b.t > evidence.breakOrSweepAt!);
    if (after.some((b) => (up ? b.c <= stopPrice : b.c >= stopPrice))) stage = "dead";
    else if (!after.some((b) => tradedIntoBuyZone(b, direction, entryTrigger))) stage = "broken";
  }
  const notes = stopPrice != null ? GANN_NOTES : NOTES;
  return { ready: stage === "confirmed", stage, note: notes[stage] };
}

const REBUY_NOTES = {
  waiting: "The trend still runs this way, so the re-entry waits for the reaction back to its level, then goes at the market.",
  confirmed: "Price reacted back to the re-entry's level, so the entry goes at the market.",
  dead: "Price closed through the re-entry's stop, so this re-entry is off.",
  resumed: "Price made a new extreme past the stopped trade's best before the reaction came, so the move resumed without it and this re-entry is off.",
} as const;

/**
 * Gann's re-buy after a stop (A-PYRAMID-07, lib/lifecycle/fromRebuy.ts), read
 * bar by bar as the replay's `walkRebuy` reads it: a bar that makes a new
 * extreme past the stopped trade's best price before any bar traded into the
 * zone calls it off (that bar first, even if it also traded into the zone);
 * so does a close through its stop. `bars` are the closed bars since the stop.
 */
function rebuyFromBars(
  bars: Bar[],
  direction: "bullish" | "bearish",
  entryTrigger: number,
  stopPrice: number,
  extreme: number,
): ConfirmationNow {
  const up = direction === "bullish";
  for (const b of bars) {
    if (up ? b.h > extreme : b.l < extreme) return { ready: false, stage: "dead", note: REBUY_NOTES.resumed };
    if (up ? b.c <= stopPrice : b.c >= stopPrice) return { ready: false, stage: "dead", note: REBUY_NOTES.dead };
    if (tradedIntoBuyZone(b, direction, entryTrigger)) return { ready: true, stage: "confirmed", note: REBUY_NOTES.confirmed };
  }
  return { ready: false, stage: "not_touched", note: REBUY_NOTES.waiting };
}

type ConfirmationInput = {
  symbol: string;
  assetClass: AssetClass;
  direction: "bullish" | "bearish";
  entryTrigger: number;
  /** The plan's stop: selects Gann's reaction rule (see `confirmationFromBars`). */
  stopPrice?: number;
  /**
   * The protocol's first target: a failed double top (bottom) the trade must
   * pass to reach it holds the entry (A-LEVELS-04). Absent, the target is
   * unknown, so any failed test beyond the entry holds it (review 12 M1).
   */
  takeProfit1?: number;
  /** Which of Gann's buying points; `oldLevel` and `hold` have nothing to cross. */
  entryKind?: GannEntryKind;
  /**
   * Count bars from this time (a plan's generation time). Default: today's
   * session, or the last four days under Gann's rule.
   */
  since?: string;
  /**
   * A re-buy after a stop (`rebuyExtremeOf`): the stopped trade's best price,
   * past which a new extreme calls the re-entry off. With it, only the bars
   * from `since` (the stop) are read.
   */
  cancelBeyond?: number;
  now?: Date;
};

/**
 * Whether the entry has confirmed now. A long carrying the protocol's stop
 * also waits while a distribution breakdown stands (A-VOLUME-03, review M2,
 * 2026-10-16): the breakdown holds a new long to Watch on the scan and exits an
 * open one, so a plan armed before it is not placed into it either. Both sides
 * also wait while a failed double or triple top (bottom) stands between the
 * entry and the first target (A-LEVELS-04, fork FL3 a), read on the same
 * 52-week entry chart as the scan.
 */
export async function readEntryConfirmationNow(input: ConfirmationInput): Promise<ConfirmationNow> {
  const read = await readEntryConfirmationCore(input);
  if (!read.ready || input.stopPrice == null) return read;
  const now = input.now ?? new Date();
  const year = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  const daily = (await getMarketDataProvider().fetchBars(input.symbol, "1Day", year, null, input.assetClass)) ?? [];
  if (input.direction === "bullish" && readDistributionStanding(daily, now)) return DISTRIBUTION_STANDS;
  const target = input.takeProfit1 ?? (input.direction === "bullish" ? Infinity : -Infinity);
  const failed = failedTestInPath(readMultipleTops(entryChartBars(daily, etDateKey(now))), input.direction, input.entryTrigger, target);
  if (failed) {
    const top = failed.kind === "top";
    return {
      ready: false,
      stage: "broken",
      note: `The market failed at a ${failed.tests >= 3 ? "triple" : "double"} ${failed.kind} near ${failed.level.toFixed(2)} and closed back ${top ? "under" : "over"} it before the first target, which marks a ${failed.kind}, so the ${top ? "buy" : "sell"} waits until a daily close passes that level by the allowance, or a new swing forms.`,
    };
  }
  return read;
}

const DISTRIBUTION_STANDS: ConfirmationNow = {
  ready: false,
  stage: "broken",
  note: "After a lower top, the stock's narrow range broke down on volume, a sign of a further decline, so a buy waits while price stays under the range, for up to 20 sessions after the break.",
};

async function readEntryConfirmationCore(input: ConfirmationInput): Promise<ConfirmationNow> {
  const now = input.now ?? new Date();
  const intervalMs = TF_INTERVAL_MS[EXECUTION_TIMEFRAME];
  const fourDays = now.getTime() - 4 * 24 * 3600 * 1000;
  const sinceMs = input.since ? Date.parse(input.since) : NaN;
  const rebuy = input.cancelBeyond != null && input.stopPrice != null && Number.isFinite(sinceMs);
  const start = new Date(rebuy ? sinceMs : Number.isFinite(sinceMs) ? Math.min(sinceMs, fourDays) : fourDays);
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
  const read = confirmationFromBars(window, input.direction, input.entryTrigger, input.stopPrice, input.entryKind, rebuy ? input.cancelBeyond : undefined);
  if (input.stopPrice == null || rebuy || restsWithoutCrossing(input.entryKind) || read.stage === "dead") return read;
  // Crossed in the window and waiting for the reaction into the zone.
  if (read.stage === "broken") return read;
  const year = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  const provider = getMarketDataProvider();
  if (read.ready) {
    const daily = await provider.fetchBars(input.symbol, "1Day", year, null, input.assetClass);
    return onVolume(daily, now, input.direction, input.entryTrigger, input.stopPrice) ? read : AWAITING_VOLUME;
  }
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
  const [daily, monthly] = await Promise.all([
    provider.fetchBars(input.symbol, "1Day", year, null, input.assetClass),
    provider.fetchBars(input.symbol, "1Month", monthlyChartFrom(year), null, input.assetClass),
  ]);
  if (!heldOnDailyChart(daily, now, input.direction, input.entryTrigger, monthly)) return read;
  // The crossing is older than the window, so every bar in it came after: the
  // entry goes at the market once one of them has reacted into the zone.
  if (!window.some((b) => tradedIntoBuyZone(b, input.direction, input.entryTrigger))) {
    return { ready: false, stage: "broken", note: GANN_NOTES.broken };
  }
  return onVolume(daily, now, input.direction, input.entryTrigger, stop) ? { ready: true, stage: "confirmed", note: GANN_NOTES.confirmed } : AWAITING_VOLUME;
}

/**
 * In a narrow range the crossing has to come on volume (A-VOLUME-10, fork
 * FV6 b): a completed session closed past the crossing line on more than the
 * range's average volume (`breakawayVolumeMet`). Read on the entry chart, the
 * completed sessions the scan and the replay read.
 */
function onVolume(daily: Bar[], now: Date, direction: "bullish" | "bearish", entry: number, stop: number): boolean {
  return breakawayVolumeMet(entryChartBars(daily, etDateKey(now)), direction, gannBreakLine(entry, stop));
}

const AWAITING_VOLUME: ConfirmationNow = {
  ready: false,
  stage: "broken",
  note: "The stock is leaving a narrow range, so the entry waits for a completed session to close past the line, from short of it, on more than the range's average volume. A quiet crossing does not count, however heavy the sessions after it.",
};

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

