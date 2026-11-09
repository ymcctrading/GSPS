/**
 * Walking a paused paper position through the bars it missed, in time order.
 *
 * Why (2026-11-09): production stopped on Oct 31, 2026, when Vercel paused
 * the account (until Nov 30). The paper exit manager (`lib/trade/exit-manager-sim.ts`)
 * did not run for a month, so 15 working paper exits were left unmanaged from
 * Oct 30. Its first pass after the lift reads the month in one go, which is
 * not how the rules would have read it:
 *
 * - "reached" for a target is judged on the best price since the fill, from
 *   every closed 15-minute bar back to the entry (`readLiveBestSinceFill`),
 *   so a target touched at any time in the month fills at the target;
 * - the stop is enforced only against the quote of that moment
 *   (`exit-manager-sim.ts`, the "Price traded through the stop" branch), so a
 *   stop broken mid-month, with the price since recovered, is never acted on;
 * - Gann's trail is read from the month-long best price.
 *
 * So a position stopped on Nov 3 that then touched its target on Nov 20 would
 * be booked as a target fill. This module walks each position bar by bar
 * instead, from its last managed time, under the same rules the live manager
 * applies on every pass (Gann's stop and exit signals from the completed
 * daily sessions, `readGannExitFromBars`; the stop ratchets, never loosens;
 * targets fill at the target on a touch), with the replay's conventions for
 * what a bar cannot tell apart (`lib/backtest/replay.ts`, `walkGannExit`):
 *
 * - Gann's daily reading is taken at the first bar of each new session, from
 *   the sessions completed before it; an exit signal leaves at that bar's open;
 * - a stop fills at the stop, or at the open when the bar opens through it
 *   (`stopFill`);
 * - a bar that reaches both the stop and a target counts as the stop
 *   (pessimistic, as the replay is wherever a bar is ambiguous).
 *
 * It is pure and writes nothing; `scripts/settle-paused-paper-exits.mjs` reads
 * the rows and bars and prints what each position would have done.
 *
 * Not modelled (each named in the script's output, so a reader knows):
 * pyramid adds and stored lots (none of the 15 has lots), an automated
 * re-buy cover (`readRebuyCover`), bad-news offers (an offer, never an
 * automatic exit), and the Intraday style's session-close exit (none of the
 * 15 came from an intraday plan; the walk reads every position as Swing,
 * which a member's style change after the fill could alter).
 *
 * Mandate questions (AGENTS.md): (1) Gann: the exit rules are his, read by the
 * same `readGannExit` the live manager and the replay use; nothing new is
 * added. (2) Cycles: none; no periodicity is claimed. (3) Hermetic: Rhythm,
 * in that a missed tick is resumed from the clock, not from a stored counter
 * (the "Cycles as architecture" rule). (4) Law of Creation: the stored
 * position and the bars it missed are only replayed together; nothing new is
 * created, it is a mixture, by design.
 */

import type { Bar } from "@/lib/types";
import { readGannExitFromBars } from "@/lib/trade/gann-exit-live";
import { regularSessionBars } from "@/lib/gann/intradayExit";
import { etDateKey } from "@/lib/market/session";
import { stopFill } from "@/lib/backtest/replay";
import { snapToTick, tickSizeFor } from "@/lib/trade/tick-size";

const BAR_MS = 15 * 60_000;

export interface PausedTranche {
  key: "scale_out" | "master" | "runner";
  qty: number;
  /** The level this tranche takes profit at; null for the runner. */
  target: number | null;
  /** Already filled before the pause. */
  done: boolean;
}

export interface PausedPosition {
  side: "long" | "short";
  entryPrice: number;
  /** The protocol stop the trade opened with (its distance is the risk unit). */
  initialStop: number;
  /** The stop in force when management stopped (`applied_stop`), or null. */
  appliedStop: number | null;
  /** The best price recorded when management stopped (`high_water`), or null. */
  highWater: number | null;
  /** When the position was opened (`created_at`, the paper fill). */
  openedAt: string;
  /** When the exit manager last read it (`last_managed_at`). */
  lastManagedAt: string;
  tranches: PausedTranche[];
}

export interface WalkFill {
  key: PausedTranche["key"];
  qty: number;
  price: number;
  at: string;
  reason: string;
}

export interface PausedWalk {
  /** "closed" once every tranche has left; "open" when some remain at `end`. */
  state: "closed" | "open";
  fills: WalkFill[];
  /** The stop in force at the end of the walk (or when the last tranche left). */
  stop: number;
  stopReason: string;
  /** The best price from the fill to the end of the walk, in bar order. */
  best: number | null;
  /** Closed 15-minute bars walked. */
  barsWalked: number;
  /** Bars where the stop and a target were both reached (counted as the stop). */
  ambiguousBars: number;
  /** Profit per share-weighted unit of risk over all tranches, filled before or during the walk; null while open. */
  rMultiple: number | null;
}

const tighter = (long: boolean, a: number, b: number) => (long ? a > b : a < b);
const reachedBy = (long: boolean, bar: Bar, level: number) => (long ? bar.h >= level : bar.l <= level);
const brokenBy = (long: boolean, bar: Bar, stop: number) => (long ? bar.l <= stop : bar.h >= stop);

/**
 * Walk one paused position over the bars it missed.
 *
 * `bars` are 15-minute bars (any range; only regular-session bars that opened
 * at or after `lastManagedAt` and closed by `end` are walked). `daily` and
 * `monthly` are completed sessions and months up to `end`; each daily reading
 * uses only the sessions before the bar's own date, so nothing is read ahead.
 */
export function walkPausedExit(input: {
  position: PausedPosition;
  bars: Bar[];
  daily: Bar[];
  monthly?: Bar[];
  sharesOutstanding?: number | null;
  end: Date;
  crypto?: boolean;
  /** Fill prices of tranches that left before the pause, for the R of a closed walk. */
  priorFills?: { key: PausedTranche["key"]; qty: number; price: number }[];
}): PausedWalk {
  const { position: p, daily, monthly = [], sharesOutstanding = null, end, crypto = false } = input;
  const long = p.side === "long";
  const from = Date.parse(p.lastManagedAt);
  const openedAt = Date.parse(p.openedAt);
  const walk = regularSessionBars(input.bars, crypto)
    .filter((b) => {
      const t = Date.parse(b.t);
      return t >= from && t >= openedAt && t + BAR_MS <= end.getTime();
    })
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  let stop = p.appliedStop ?? p.initialStop;
  if (p.appliedStop != null && tighter(long, p.initialStop, p.appliedStop)) stop = p.initialStop;
  let stopReason = p.appliedStop != null ? "applied" : "protocol";
  let best = p.highWater;
  const open = p.tranches.filter((t) => !t.done && t.qty > 0).map((t) => ({ ...t }));
  const fills: WalkFill[] = [];
  let ambiguousBars = 0;
  let barsWalked = 0;
  let lastDate = etDateKey(new Date(from));
  const tick = tickSizeFor({ assetType: "EQUITY" }, p.entryPrice > 0 ? p.entryPrice : 1).size;

  const closeAll = (price: number, at: string, reason: string) => {
    for (const t of open.splice(0)) fills.push({ key: t.key, qty: t.qty, price, at, reason });
  };

  for (const bar of walk) {
    barsWalked++;
    const date = etDateKey(new Date(bar.t));
    if (date !== lastDate) {
      lastDate = date;
      const prior = daily.filter((d) => etDateKey(new Date(d.t)) < date);
      if (prior.length >= 10) {
        const reading = readGannExitFromBars(
          { symbol: "", side: p.side, entryPrice: p.entryPrice, initialStop: p.initialStop, openedAt: p.openedAt, best },
          prior,
          sharesOutstanding,
          monthly.filter((m) => etDateKey(new Date(m.t)) < date),
        );
        if (reading.exit) {
          closeAll(bar.o, bar.t, `exit signal: ${reading.exit.reason}`);
          break;
        }
        // Snapped to the tick away from the price, as `planStopAdjustment` snaps it.
        const snapped = snapToTick(reading.stop, tick, long ? "down" : "up");
        if (tighter(long, snapped, stop)) {
          stop = snapped;
          stopReason = reading.stopReason;
        }
      }
    }

    const stopHit = brokenBy(long, bar, stop);
    const targetsHit = open.filter((t) => t.target != null && reachedBy(long, bar, t.target));
    if (stopHit) {
      if (targetsHit.length > 0) ambiguousBars++;
      closeAll(stopFill(long, stop, bar.o), bar.t, `stop (${stopReason})`);
      break;
    }
    for (const t of targetsHit) {
      fills.push({ key: t.key, qty: t.qty, price: t.target!, at: bar.t, reason: t.key === "scale_out" ? "TP1" : "MTP" });
      open.splice(open.indexOf(t), 1);
    }
    best = best == null ? (long ? bar.h : bar.l) : long ? Math.max(best, bar.h) : Math.min(best, bar.l);
    if (open.length === 0) break;
  }

  const state = open.length === 0 ? "closed" : "open";
  let rMultiple: number | null = null;
  const risk = long ? p.entryPrice - p.initialStop : p.initialStop - p.entryPrice;
  if (state === "closed" && risk > 0) {
    const all = [...(input.priorFills ?? []), ...fills];
    const qty = all.reduce((n, f) => n + f.qty, 0);
    if (qty > 0) {
      const pnl = all.reduce((n, f) => n + f.qty * (long ? f.price - p.entryPrice : p.entryPrice - f.price), 0);
      rMultiple = pnl / qty / risk;
    }
  }
  return { state, fills, stop, stopReason, best, barsWalked, ambiguousBars, rMultiple };
}

/**
 * What the live manager's first pass after the lift would do with the same
 * position, for comparison: targets judged on the month's best price, the
 * stop judged only against the last price, Gann's reading taken once from
 * every completed session with the month's best. Mirrors
 * `exit-manager-sim.ts`'s `advance` for a Swing position with no lots.
 */
export function firstPassAfterPause(input: {
  position: PausedPosition;
  bars: Bar[];
  daily: Bar[];
  monthly?: Bar[];
  sharesOutstanding?: number | null;
  end: Date;
  lastPrice: number;
  crypto?: boolean;
}): { fills: { key: PausedTranche["key"]; qty: number; price: number; reason: string }[]; stop: number; best: number | null } {
  const { position: p, end, lastPrice, crypto = false } = input;
  const long = p.side === "long";
  const openedAt = Date.parse(p.openedAt);
  let best = p.highWater;
  for (const b of regularSessionBars(input.bars, crypto)) {
    const t = Date.parse(b.t);
    if (t < openedAt || t + BAR_MS > end.getTime()) continue;
    best = best == null ? (long ? b.h : b.l) : long ? Math.max(best, b.h) : Math.min(best, b.l);
  }
  best = best == null ? lastPrice : long ? Math.max(best, lastPrice) : Math.min(best, lastPrice);
  const open = p.tranches.filter((t) => !t.done && t.qty > 0);
  const fills: { key: PausedTranche["key"]; qty: number; price: number; reason: string }[] = [];
  const today = etDateKey(end);
  const reading = readGannExitFromBars(
    { symbol: "", side: p.side, entryPrice: p.entryPrice, initialStop: p.initialStop, openedAt: p.openedAt, best },
    input.daily.filter((d) => etDateKey(new Date(d.t)) < today),
    input.sharesOutstanding ?? null,
    (input.monthly ?? []).filter((m) => etDateKey(new Date(m.t)) < today),
  );
  let stop = p.appliedStop ?? p.initialStop;
  const snapped = snapToTick(reading.stop, tickSizeFor({ assetType: "EQUITY" }, p.entryPrice > 0 ? p.entryPrice : 1).size, long ? "down" : "up");
  if (tighter(long, snapped, stop)) stop = snapped;
  const remaining = open.filter((t) => {
    if (t.target != null && (long ? best! >= t.target : best! <= t.target)) {
      fills.push({ key: t.key, qty: t.qty, price: t.target, reason: t.key === "scale_out" ? "TP1" : "MTP" });
      return false;
    }
    return true;
  });
  if (remaining.length > 0 && (reading.exit || (long ? lastPrice <= stop : lastPrice >= stop))) {
    for (const t of remaining) fills.push({ key: t.key, qty: t.qty, price: lastPrice, reason: reading.exit ? `exit signal: ${reading.exit.reason}` : "stop" });
  }
  return { fills, stop, best };
}
