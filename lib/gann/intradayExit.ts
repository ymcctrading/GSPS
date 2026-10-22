/**
 * The Intraday style's exits: Gann's method read on the session's own bars,
 * for a trade meant to be in and out within hours (owner, 2026-10-22: "The
 * goal is to get AND out in a matter of seconds, mins, or hours. And ideally
 * closed by the end of the day (although not mandatory)").
 *
 * One module, read by the intraday replay (`lib/backtest/replayIntraday.ts`,
 * which these rules were first written for), the paper exit manager and the
 * broker exit manager (`lib/trade/gann-exit-live.ts`), so a trade is walked
 * the same way wherever it runs.
 *
 * **Gann's rules, at the session's scale (Tier A):**
 * - **The hourly chart decides.** "When markets are very active ... keep an
 *   hourly High and Low Chart ... the Hourly Chart will give the first change
 *   in trend" (Master Course Ch. 13). The trade leaves on the next bar once
 *   the 3-bar swing chart on hourly bars turns against it after the fill
 *   (`hourlyTurnedAgainst`), Gann's own swing chart (`swingChart.ts`).
 * - **The stop follows each completed bottom.** Stops "1 point" beyond the
 *   last bottom, following each new one (the Overnight Chart method, Master
 *   Course Ch. 3, pp. 68-71; NSTD's 1, 2 and 3-point stops). Read here on the
 *   15-minute bars' 3-bar swings, one intraday point beyond the last
 *   completed bottom (top, short), only ever tightened (`intradayTrail`).
 * - **The first target is an old level that pays more than the risk.** The
 *   intraday alert's own TP1 (`gannFirstTarget`: the nearest old top or
 *   bottom, or a round number short of one; M-K5, the target must pay more
 *   than the risk). 60% of the position leaves there and the rest runs on the
 *   stop above, as in the intraday replay.
 *
 * **Not Gann, the owner's choice, labelled:** closing what is left at the end
 * of the session. Gann never closed a trade because a session ended ("the big
 * money ... is made on the long swings and not by day to day trading", W036).
 * The owner asked for it as the default, "not mandatory", so a trader can
 * hold an intraday trade overnight from the order ticket (`hold_overnight`).
 * The close is due from 15:45 ET, the session's last 15-minute bar, or at the
 * first pass after a close the trade was still open through. US equities only:
 * crypto has no session, so its intraday trades end on the stop, the target or
 * the hourly turn.
 *
 * Engineering choices, labelled as such: the intraday point is
 * `pointScale.ts#intradayPoint` (Gann's point scaled by the bars' ATR against
 * the daily ATR), fixed at the fill; 15:45 ET is the start of the last bar the
 * scheduled pass runs in (every 15 minutes, `:54` past the hour in the
 * session); early-close days are not known (the calendar holds none).
 *
 * Three-question basis: 1. Gann, as cited (Tier A), the session close being
 * the owner's. 2. No periodicity claim; Dewey's checklist does not apply.
 * 3. Correspondence: "the daily and even hourly movements" obey the same law
 * (the 1909 interview), so the swing chart and the stop under the last bottom
 * are read on the hour as on the day; Rhythm: the trade lives one session,
 * out and in. Law of Creation: method ⊗ session, the swing rules read inside
 * one day create a trade that starts and ends with the session, which the
 * swing method alone never makes.
 */

import type { Bar } from "@/lib/types";
import { swingPivots, walkSwingChart } from "@/lib/gann/swingChart";
import { equitySession, etDateKey, etParts, mostRecentClose } from "@/lib/market/session";

/** Closed bars read for the swing charts and the trail. Bounds the work per bar; two completed swings fit in far less. */
export const INTRADAY_WINDOW_BARS = 400;
/** The 3-bar swing chart, Gann's own, at the bars' scale. */
export const INTRADAY_SWING_BARS = 3;
/** 15:45 ET, the start of the session's last 15-minute bar. */
export const SESSION_CLOSE_FROM_MINUTES = 15 * 60 + 45;

/** Roll bars up to the hour, keyed on the bar's UTC hour (as the intraday alerts and replay always have). */
export function hourlyBars(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let key = "";
  for (const b of bars) {
    const k = b.t.slice(0, 13);
    const cur = out[out.length - 1];
    if (k !== key || !cur) {
      out.push({ ...b });
      key = k;
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
  return out;
}

/**
 * The stop one intraday point beyond the last completed swing bottom (top,
 * short) of `window`, when that tightens `stop` and still sits on the safe
 * side of the window's last close. Null when it would not move.
 */
export function intradayTrail(window: Bar[], long: boolean, stop: number, point: number): number | null {
  if (window.length === 0) return null;
  const close = window[window.length - 1].c;
  const last = [...swingPivots(window, INTRADAY_SWING_BARS)].reverse().find((p) => p.kind === (long ? "bottom" : "top"));
  if (!last) return null;
  const candidate = long ? last.price - point : last.price + point;
  const tighter = long ? candidate > stop : candidate < stop;
  const safe = long ? candidate < close : candidate > close;
  return tighter && safe ? candidate : null;
}

/** Whether the 3-bar swing chart on the hourly roll-up of `window` reads against the trade. */
export function hourlyTurnedAgainst(window: Bar[], long: boolean): boolean {
  const trend = walkSwingChart(hourlyBars(window), INTRADAY_SWING_BARS).trend;
  return trend !== null && trend !== (long ? "bullish" : "bearish");
}

/**
 * Whether an intraday trade filled at `filledAt` is due to close for the
 * session's end at `now`: from 15:45 ET in a regular session, or at any time
 * once a close has passed since the fill (a pass that missed the last bar).
 * US equities only.
 */
export function sessionCloseDue(now: Date, filledAt: Date): boolean {
  if (mostRecentClose(now).getTime() > filledAt.getTime()) return true;
  return equitySession(now) === "regular" && etParts(now).minutes >= SESSION_CLOSE_FROM_MINUTES;
}

/** Whether `bar` is the session's last bar in `bars` (the next bar falls on a later New York date, or there is none). */
export function isSessionLastBar(bars: Bar[], index: number): boolean {
  const next = bars[index + 1];
  if (!next) return false;
  return etDateKey(new Date(next.t)) !== etDateKey(new Date(bars[index].t));
}

export type IntradayStopReason = "initial" | "intraday_swing";
export type IntradayExitSignal = "intraday_trend_change" | "session_close";

export interface IntradayExitReading {
  stop: number;
  stopReason: IntradayStopReason;
  exit: { reason: IntradayExitSignal; note: string } | null;
}

/**
 * The live reading for an open intraday trade, from the closed 15-minute bars
 * up to now: the stop walked bar by bar from the fill (as the replay walks
 * it), the hourly turn on any closed bar since the fill, and the session close.
 * `bars` are closed bars, oldest first, with history before the fill.
 */
export function readIntradayExit(input: {
  side: "long" | "short";
  initialStop: number;
  /** The fill's time (ISO). */
  filledAt: string;
  /** One intraday point, fixed at the fill. */
  point: number;
  bars: Bar[];
  now: Date;
  /** False when the trader chose to hold the trade overnight, and for crypto. */
  closeAtSessionEnd: boolean;
}): IntradayExitReading {
  const long = input.side === "long";
  let stop = input.initialStop;
  let stopReason: IntradayStopReason = "initial";
  let turned = false;
  // The first change in trend after the fill: an alert can fire against the
  // hourly chart (a reversal signal), so a trend already against the trade at
  // the fill is not a change. The replay enters with the hourly trend, where
  // the two readings agree.
  let wasAgainst: boolean | null = null;
  for (let j = 0; j < input.bars.length; j++) {
    if (input.bars[j].t < input.filledAt) continue;
    if (wasAgainst === null) wasAgainst = j > 0 && hourlyTurnedAgainst(input.bars.slice(Math.max(0, j - INTRADAY_WINDOW_BARS), j), long);
    const window = input.bars.slice(Math.max(0, j + 1 - INTRADAY_WINDOW_BARS), j + 1);
    if (input.point > 0) {
      const next = intradayTrail(window, long, stop, input.point);
      if (next !== null) {
        stop = next;
        stopReason = "intraday_swing";
      }
    }
    const against = hourlyTurnedAgainst(window, long);
    if (against && !wasAgainst) turned = true;
    wasAgainst = against;
  }
  if (input.closeAtSessionEnd && sessionCloseDue(input.now, new Date(input.filledAt))) {
    return { stop, stopReason, exit: { reason: "session_close", note: "The session is ending, so the intraday trade closes at the market." } };
  }
  if (turned) {
    return {
      stop,
      stopReason,
      exit: { reason: "intraday_trend_change", note: "The hourly chart turned against the trade (its first change in trend), so it closes at the market." },
    };
  }
  return { stop, stopReason, exit: null };
}
