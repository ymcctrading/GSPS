/**
 * The reaction stopped at an old level and held: `historicalSR`'s rule since
 * 2026-10-21 (diagnosis: `/mnt/project-files/replay-diagnosis/
 * 2026-10-21-historicalSR-saturation.md`).
 *
 * Until then the check passed whenever any level of the wanted role sat within
 * Gann's 3-point allowance of price. The pool holds five lattices (the Square
 * of 144, the planetary averages, the active angles, Jensen's square of 90 and
 * the pattern angles, now the Square of Nine too), each adding its nearest
 * point below and above price, plus the daily pivots. On random walks it
 * passed 98-100% of readings. Gann never confirms a level by proximity: price
 * has to act there.
 * - "Single bottom: after a reaction, wait until it holds a level 2-3 weeks,
 *   buy with a stop 3 points under the lowest week (2-3 days and the lowest
 *   day in active markets)" (W006 p.20; Rule 3(b), p.46).
 * - "A stock nearly always gets support the first time it reacts back to old
 *   high levels" (*Truth of the Stock Tape*, American Loco).
 * - After crossing an old top, "it should not react 3 points below the old
 *   high" (W006 p.20, Rule 3(c)).
 * - Master Course Ch. 9 (PDF 266-277): a level counts because price reached it
 *   and held inside the 3 points ("held 2½ above 193"; "not 3 points above 193").
 *
 * The rule, for a long (a short is the mirror, highest high and resistance):
 * 1. an old level at or below price: the weekly and monthly pivots, Gann's
 *    percentage levels, the campaign bottoms and the secondary turn
 *    (`lib/scan/structuralLevels.ts`, `old`). The lattices and the daily
 *    pivots are left out; they stay in the S/R list for stops, TP1, MTP and
 *    the card;
 * 2. the lowest low of the last 10 completed sessions printed from 3 Gann
 *    points under the level to 1 point over it ("within 1-3 points", "a 1-2
 *    point reaction");
 * 3. that low is 2 or more sessions old, and no close since has gone through
 *    the level by 3 points.
 * Points are price-scaled at the level (`pointScale.ts`).
 * Inside the 10 sessions the third condition follows from the second: every
 * close since the low is at or above that low, so none is 3 points through the
 * level. It is kept so the code reads as Gann states the rule.
 *
 * Engineering choices, labelled as such: the 10-session look-back for "the
 * reaction"; the weekly and monthly pivots as the stand-in for "old" (the
 * pivots carry no formation date); 2 sessions as the minimum hold, Gann's
 * lower bound for active markets. His weekly form (2-3 weeks over the lowest
 * week) is not read here.
 *
 * Three-question basis:
 * 1. Gann, as cited (Tier A: W006, *Truth of the Stock Tape*, the Master Course).
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. A level is not a cause by being near; the
 *    cause is the market acting at it (stopping and holding), and the effect,
 *    support, follows from that. Law of Creation: level ⊗ reaction, a created
 *    third (the held level) neither has alone; proximity was only a mixture.
 */
import type { Bar, Timeframe } from "@/lib/types";
import { pricePoint, threePoints } from "@/lib/gann/pointScale";

type Side = "bullish" | "bearish";

/** Engineering choice: the completed sessions read as "the reaction". */
export const HELD_LEVEL_SESSIONS = 10;
/** Engineering choice: the reaction's extreme is at least this many sessions old (Gann's "2-3 days" in active markets). */
export const HELD_LEVEL_MIN_AGE = 2;

export interface HeldLevelMatch {
  /** The old level the reaction stopped at. */
  price: number;
  timeframe: Timeframe;
  /** The reaction's extreme: the lowest low (long) or highest high (short). */
  extreme: number;
  /** Completed sessions since the extreme printed (0 = the last session). */
  sessionsAgo: number;
}

/**
 * The old level the last reaction stopped at and has held, on `side`'s role,
 * or null. `sessions` are completed sessions only, oldest first.
 */
export function readHeldLevel(
  sessions: Bar[],
  levels: { price: number; timeframe: Timeframe }[],
  price: number,
  side: Side,
): HeldLevelMatch | null {
  if (sessions.length < HELD_LEVEL_SESSIONS || !(price > 0)) return null;
  const long = side === "bullish";
  const window = sessions.slice(-HELD_LEVEL_SESSIONS);
  let k = 0;
  for (let j = 1; j < window.length; j++) {
    if (long ? window[j].l < window[k].l : window[j].h > window[k].h) k = j;
  }
  const sessionsAgo = window.length - 1 - k;
  if (sessionsAgo < HELD_LEVEL_MIN_AGE) return null;
  const extreme = long ? window[k].l : window[k].h;
  const since = window.slice(k);
  let best: HeldLevelMatch | null = null;
  for (const lv of levels) {
    const L = lv.price;
    if (!(L > 0) || (long ? L > price : L <= price)) continue;
    const one = pricePoint(L);
    const three = threePoints(L);
    const at = long ? extreme >= L - three && extreme <= L + one : extreme <= L + three && extreme >= L - one;
    if (!at) continue;
    if (since.some((b) => (long ? b.c < L - three : b.c > L + three))) continue;
    if (!best || Math.abs(extreme - L) < Math.abs(extreme - best.price)) {
      best = { price: L, timeframe: lv.timeframe, extreme, sessionsAgo };
    }
  }
  return best;
}
