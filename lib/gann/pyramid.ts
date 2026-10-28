/**
 * Gann's pyramiding rules (parity roadmap, "pyramiding"; built 2026-09-28 by
 * project-owner direction: "if it applies to Gann's method, then yes").
 *
 * Pyramiding is adding to a winning position as the trend proves itself. What
 * Gann says (Tier A; `docs/memory-bank/sources/`):
 * - **Only add to a winner; never average a loss** ("the greatest mistake any
 *   trader can make"). Add a lot only once the last one shows the full
 *   interval of profit (*New Stock Trend Detector* Rule 5).
 * - **Add where the trend proves itself:** on each crossing of an old top (a
 *   bottom, for shorts) (*How to Make Profits in Commodities*; *45 Years in
 *   Wall Street*: "pyramid only after resistance is crossed").
 * - **Each lot smaller than the last, then on at the smallest:** "the first risk
 *   should be the greatest", 100, 50, 30, 20 and 10 shares (*Truth of the
 *   Stock Tape*, 1923, Ch. IX), the Master Course's "safest pyramiding rule"
 *   100/50/30/20 (How to Trade, Nov. 1935, PDF 234-238), and "buy the largest
 *   amount first and then gradually decrease" (*Tunnel Thru the Air*, W022
 *   p.198). `PYRAMID_LOTS` holds the sequence as fractions of the first lot.
 *   None of them says to stop at the fifth, and *New Stock Trend Detector*
 *   Rule 5 (W006 p.47) goes on adding "after the fourth or fifth lot" at a
 *   cut unit, so lots after the fifth stay at the fifth's size, a tenth of
 *   the first; the adds end as the trend and the steps stop giving them.
 *   Owner, 2026-10-22: "Just follow Gann's method." Until then each add was
 *   half the last (Q9, 2026-10-16), which no book states past the second.
 * - **Move the stop so the combined position can't lose** (*New Stock Trend
 *   Detector* Rule 5), with a full stop-out losing no more than 10% of capital
 *   (Master Course).
 * - **Add only once the trade has shown it is with the trend:** a profit at
 *   the first close that is still there after three days (A-TIME-12, W006
 *   p.23; `readHoldTime`). Before that, the first lot has not shown which
 *   side of the trend it is on.
 * - **Pyramid longs in stocks with small capital and shorts in stocks with
 *   large capital** (never-failing rule 21, *Wall Street Stock Selector*,
 *   1930, Ch. II pp. 18-28; W005 reading notes). The reason is in *Truth of
 *   the Stock Tape* (1923) Ch. III pp. 5-7: the same buying moves a stock with
 *   a small supply of shares 5-10 points (Baldwin, 200,000 shares) and hardly
 *   moves one with a large supply (General Motors, 50 million). So a long adds
 *   where demand can lift price fastest, and a short adds where the weight of
 *   supply keeps a decline going. Added 2026-10-16 (owner: Gann's method
 *   supersedes GSPS's). `capitalStock` carries the share count (migration
 *   0083); a stock whose count isn't known gets no add, since the rule can't
 *   be checked. It covers stocks only: crypto omits the field.
 *
 * How GSPS applies it: `readPyramidAdd` says whether the position has earned
 * an add now, how large, at what trigger, and where the whole position's stop
 * goes. The Portfolio shows it as a suggestion, the replay measures it
 * (`pyramid: true`), and since 2026-10-22 the portfolio manager places it on
 * the lines it opened (lib/automation/pyramid-adds.ts, paper), merging each
 * add into the line's one exit row as the replay walks one position.
 *
 * - **Add at fixed steps** (A-PYRAMID-01, W006 p.47 Rule 5: every 5 points
 *   for stocks at $20-50, every 10 at $80-200; A-PYRAMID-06, W022 pp.196-199:
 *   10-point steps). Read as `PYRAMID_STEP_POINTS` Gann points past the last
 *   lot, price-scaled by `pricePoint`, which makes his 5 at $42.50 and about
 *   10 at $150-200 one figure. Until 2026-10-16 the step was one risk unit.
 * - **Raise the whole line's stop to 10 points under as it grows** (A-STOP-06,
 *   W022 p.198: at 253 the stop on the whole line goes to 243). Read as the
 *   tighter of combined break-even and `PYRAMID_STEP_POINTS` Gann points
 *   beyond the add (`wholeLineStop`).
 *
 * Engineering choices, labelled as such:
 * - Rule 21's small/large cutoff: the text gives no figure. Its examples are
 *   relative (200,000 shares small, 5 and 50 million large, in 1923), and a
 *   1920s share count doesn't port to today's issues. `LARGE_CAPITAL_MIN_SHARES`
 *   is 500 million shares outstanding, a round figure near the middle of the
 *   large-cap universe GSPS scans, so roughly half of it reads each way. It is
 *   unmeasured; re-derive it from the stored counts' median if the split
 *   proves lopsided.
 * - The add trigger is a completed 3-Day Chart top (bottom) made after the last
 *   lot, crossed by the 3-point allowance: the same Buying Point the entry
 *   uses (`entryTrigger.ts`).
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect: an add is earned by the trend's own proof
 *    (a crossed top), never by hope. Polarity: the rule is mirrored for shorts,
 *    and its opposite, averaging a loss, is what it forbids. Rhythm fits the
 *    shrinking lots: each wave of the campaign gets less new capital, as the
 *    move ages.
 */

import type { Bar } from "@/lib/types";
import { beyondByThreePoints, pricePoint } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { readHoldTime } from "@/lib/gann/exitRules";

export interface PyramidLot {
  qty: number;
  price: number;
  /** YYYY-MM-DD the lot filled. */
  date: string;
}

export interface PyramidInput {
  side: "long" | "short";
  lots: PyramidLot[];
  /** The stop protecting the whole position now. */
  stop: number;
  /** The first lot's initial stop; its distance from the first entry is the risk unit. */
  initialStop: number;
  /** Completed daily sessions, oldest first, including history before the first lot. */
  daily: Bar[];
  /** The current price. */
  price: number;
  /**
   * Shares outstanding for a stock (rule 21), as of the session read. Null:
   * a stock whose count isn't known, which gets no add. Omitted: a market the
   * rule doesn't cover (crypto).
   */
  capitalStock?: number | null;
}

export interface PyramidAdd {
  qty: number;
  /** Buy (sell) stop for the add: the crossed swing level plus the allowance. */
  trigger: number;
  /** The whole position's stop after the add: never below the combined break-even. */
  newStop: number;
  note: string;
}

export interface PyramidReading {
  add: PyramidAdd | null;
  /** Why no add is due, in plain words. Null when one is. */
  reason: string | null;
  /** The first lot closed against the trade on its first day (A-TIME-12): a warning that the trade may be wrong. */
  holdWarning?: string | null;
}

/**
 * Engineering choice (see the header): the share count at or above which a
 * stock reads as having a large capital stock under rule 21.
 */
export const LARGE_CAPITAL_MIN_SHARES = 500_000_000;

/**
 * Each lot as a fraction of the first: 100, 50, 30, 20, 10 shares (*Truth of
 * the Stock Tape* Ch. IX; the Master Course's 100/50/30/20). Lots after the
 * fifth stay at its size (W006 p.47 keeps adding at the cut unit).
 */
export const PYRAMID_LOTS = [1, 0.5, 0.3, 0.2, 0.1] as const;

/** The next lot's size as a fraction of the first, given the lots already on (null with none). */
export function nextLotFraction(lotsOn: number): number | null {
  if (!(lotsOn >= 1)) return null;
  return PYRAMID_LOTS[Math.min(lotsOn, PYRAMID_LOTS.length - 1)];
}

/** Gann points of profit between lots, and between an add and the whole line's stop. */
export const PYRAMID_STEP_POINTS = 5;

/**
 * The whole position's stop after an add: the tighter of combined break-even
 * and `PYRAMID_STEP_POINTS` Gann points beyond the add (A-STOP-06), and never
 * looser than the stop already in place.
 */
export function wholeLineStop(side: "long" | "short", avg: number, trigger: number, current: number): number {
  const step = PYRAMID_STEP_POINTS * pricePoint(trigger);
  return side === "long" ? Math.max(current, avg, trigger - step) : Math.min(current, avg, trigger + step);
}

export function capitalSize(shares: number | null | undefined): "small" | "large" | null {
  if (shares == null || !(shares > 0)) return null;
  return shares >= LARGE_CAPITAL_MIN_SHARES ? "large" : "small";
}

/** A working `protocol_exits` row: one lot of an open, protocol-managed position. */
export interface WorkingLotRow {
  side: "long" | "short";
  mode?: string | null;
  qty: number;
  entry_price: number;
  stop_loss: number;
  applied_stop: number | null;
  created_at: string;
  /**
   * The lots of a line pyramided by automation (migration 0111), oldest
   * first; null or absent on a row of one lot. When present the row's `qty`
   * and `entry_price` are the whole line's, and the lots are read instead.
   */
  lots?: unknown;
}

/** A stored `lots` value, or null when it isn't a list of priced lots. */
export function readStoredLots(value: unknown): PyramidLot[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lots: PyramidLot[] = [];
  for (const v of value) {
    const lot = v as Record<string, unknown>;
    const qty = Number(lot?.qty);
    const price = Number(lot?.price);
    const date = typeof lot?.date === "string" ? lot.date : null;
    if (!(qty > 0) || !(price > 0) || !date) return null;
    lots.push({ qty, price, date });
  }
  return lots;
}

/**
 * The open line as `readPyramidAdd` reads it, from the symbol's working lots
 * oldest first: every lot on the newest lot's side and account mode (paper and
 * live are separate lines; Gann's lots are sized from the first), the risk
 * unit from the first lot's initial stop, and the line's stop the tightest of
 * the lots' stops, since an add never loosens it. A row with no fill price
 * yet is not a lot. Null with no lots. Live rows carry the broker's blended
 * entry price once filled, so a live line's step check reads the blend: a
 * known gap, latent while no live broker is connected. A paper line pyramided
 * by automation carries its lots (`lots`), which are read in its place.
 */
export function pyramidLineFromRows(
  rows: WorkingLotRow[],
  dateKey: (d: Date) => string,
): Pick<PyramidInput, "side" | "lots" | "stop" | "initialStop"> | null {
  const priced = rows.filter((r) => Number(r.entry_price) > 0);
  if (priced.length === 0) return null;
  const { side, mode } = priced[priced.length - 1];
  const same = priced.filter((r) => r.side === side && (r.mode ?? null) === (mode ?? null));
  const stops = same.map((r) => Number(r.applied_stop ?? r.stop_loss));
  return {
    side,
    lots: same.flatMap((r) =>
      readStoredLots(r.lots) ??
      [{ qty: Number(r.qty), price: Number(r.entry_price), date: dateKey(new Date(r.created_at)) }],
    ),
    stop: side === "long" ? Math.max(...stops) : Math.min(...stops),
    initialStop: Number(same[0].stop_loss),
  };
}

export function readPyramidAdd(input: PyramidInput): PyramidReading {
  const { side, lots, daily, price } = input;
  const long = side === "long";
  if (lots.length === 0) return { add: null, reason: "No position." };

  // Rule 21: longs are added to in stocks with a small capital stock, shorts
  // in stocks with a large one.
  if (input.capitalStock !== undefined) {
    const size = capitalSize(input.capitalStock);
    if (size === null) {
      return { add: null, reason: "The company's share count isn't known, so its capital stock can't be read for an add." };
    }
    if (long && size === "large") {
      return { add: null, reason: "Longs are added to only in stocks with a small capital stock, and this one has a large one." };
    }
    if (!long && size === "small") {
      return { add: null, reason: "Shorts are added to only in stocks with a large capital stock, and this one has a small one." };
    }
  }

  const first = lots[0];
  const last = lots[lots.length - 1];
  const risk = Math.abs(first.price - input.initialStop);
  if (!(risk > 0)) return { add: null, reason: "No risk unit to measure profit against." };

  // Time to hold (A-TIME-12): with the trend only once the first lot showed a
  // profit at its first close and still after three days.
  const hold = readHoldTime(side, first.price, first.date, daily);
  const holdWarning = hold?.firstCloseAgainst
    ? "The first day closed against the trade, a sign it may be wrong."
    : null;
  if (hold?.withTrendAfter3 !== true) {
    return {
      add: null,
      reason:
        hold?.withTrendAfter3 === false
          ? "The trade did not show a profit at its first close and three days on, so it hasn't shown it is with the trend."
          : "Three days haven't closed since the first lot, so the trade hasn't shown it is with the trend yet.",
      holdWarning,
    };
  }

  // Only add to a winner, at fixed steps: the last lot must show
  // PYRAMID_STEP_POINTS Gann points of profit (A-PYRAMID-01, A-PYRAMID-06).
  const lastProfit = long ? price - last.price : last.price - price;
  if (lastProfit < PYRAMID_STEP_POINTS * pricePoint(last.price)) {
    return { add: null, reason: "The last lot hasn't yet gained a full step of profit." };
  }

  // Where the trend proves itself: an old top (bottom) made since the last lot.
  const swings = walkSwingChart(daily, THREE_DAY_CHART);
  const lastIdx = daily.findIndex((b) => b.t.slice(0, 10) >= last.date);
  const pivot = [...swings.pivots]
    .reverse()
    .find((p) => p.kind === (long ? "top" : "bottom") && lastIdx !== -1 && p.index >= lastIdx);
  if (!pivot) return { add: null, reason: "No swing top has formed since the last lot to cross." };
  const trigger = beyondByThreePoints(pivot.price, long ? 1 : -1);

  const fraction = nextLotFraction(lots.length);
  if (fraction === null) return { add: null, reason: "No position." };
  const qty = Math.floor(first.qty * fraction + 1e-9);
  if (qty < 1) return { add: null, reason: "The next lot would be less than one share." };

  // The whole position's stop: never where the combined position could lose.
  const totalQty = lots.reduce((n, l) => n + l.qty, 0) + qty;
  const avg = (lots.reduce((n, l) => n + l.qty * l.price, 0) + qty * trigger) / totalQty;
  const newStop = wholeLineStop(side, avg, trigger, input.stop);
  // A stop that would already be through the market can't be placed.
  if (long ? newStop >= price : newStop <= price) {
    return { add: null, reason: "Price is too close to break-even for the combined position to be protected." };
  }

  return {
    add: {
      qty,
      trigger,
      newStop,
      note: `Add ${qty} share${qty === 1 ? "" : "s"} if price ${long ? "crosses above" : "breaks below"} ${trigger.toFixed(2)} (the last swing ${long ? "top" : "bottom"}), then move the stop on the whole position to ${newStop.toFixed(2)} so it can't turn into a loss.`,
    },
    reason: null,
  };
}

/**
 * Never-failing rule 13, "never average a loss" (*45 Years* rule 13; W006
 * Rule 5, add only "when the market moves in your favour"), at placement: a
 * new entry on the same side as an open position in the symbol is refused
 * unless that position shows a profit at the price the add would fill at. A
 * buy adds to a long and a sell to a short; an order on the other side is a
 * close, which is never refused here. The suggestion (`readPyramidAdd`)
 * already waits for a full step of profit; this binds every other add, the
 * ticket's included (recheck 2026-10-22, A-PYRAMID-03/04: placement had
 * treated a held symbol as no new market and placed an add to a loser).
 */
export function averagingLossRefusal(input: {
  symbol: string;
  side: "buy" | "sell";
  price: number;
  open: { symbol: string; side: "long" | "short"; avgPrice: number; qty: number }[];
}): { error: string; code: "average_a_loss" } | null {
  const symbol = input.symbol.toUpperCase();
  const side = input.side === "buy" ? "long" : "short";
  const held = input.open.filter((p) => p.symbol.toUpperCase() === symbol && p.side === side && p.qty > 0 && p.avgPrice > 0);
  if (held.length === 0 || !(input.price > 0)) return null;
  const qty = held.reduce((s, p) => s + p.qty, 0);
  const avg = held.reduce((s, p) => s + p.avgPrice * p.qty, 0) / qty;
  const inProfit = side === "long" ? input.price > avg : input.price < avg;
  if (inProfit) return null;
  return {
    error: `The ${side} position in ${symbol} shows no profit at ${input.price.toFixed(2)} (average ${avg.toFixed(2)}), and a loss is never added to. Nothing was placed.`,
    code: "average_a_loss",
  };
}
