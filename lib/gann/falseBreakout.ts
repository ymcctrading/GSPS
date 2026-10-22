/**
 * A false breakout (C-STOP-01; W003 p.17, W034 p.2): a move outside a range
 * that fails the following week without exceeding the range's top by more
 * than 3 points. Context only, measured (`contextFactors.ts`,
 * `falseBreakoutAgrees`). The rule's origin in Gann's own books is unread
 * (class UNVERIFIABLE in the feature map); Gann's 3-point allowance itself is
 * his (`pointScale.ts`), and the Master Course's "3 full points = a definite
 * signal" is the same test from the other side.
 *
 * The reading, on completed weeks only (the week still trading is never
 * read, so the live scan and the replay see the same weeks):
 * - the range: the `FALSE_BREAKOUT_RANGE_WEEKS` weeks before the break week,
 *   its top the highest high and its bottom the lowest low;
 * - the break week traded over the top, by no more than Gann's price-scaled
 *   3 points;
 * - the following week closed back under the top (failed).
 * The bottom mirrors it, an inference from Gann's symmetric treatment of tops
 * and bottoms, labelled as such. A false breakout up reads bearish, down
 * bullish.
 *
 * Engineering choices, labelled: the range is 13 weeks, the breakaway's range
 * (`BREAKAWAY_RANGE_DAYS`); "fails" is a close back inside; weeks run Monday
 * to Friday.
 *
 * Three-question basis: 1. W003 p.17 (class C compiler, origin unread) on
 * Gann's 3 points. 2. No periodicity claim; Dewey does not apply. 3. Polarity
 * (the failed push up is the cause of the move down) and Cause and Effect.
 */
import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { gannThreePoints } from "@/lib/gann/pointScale";

/** Weeks in the range a breakout is read against: 13, the breakaway's range. */
export const FALSE_BREAKOUT_RANGE_WEEKS = 13;

export interface FalseBreakoutReading {
  /** Bearish for a false break over the top, bullish under the bottom. */
  direction: "bullish" | "bearish";
  /** The range edge broken (top or bottom). */
  level: number;
  /** The break week's extreme past it. */
  extreme: number;
  /** The break week's Monday, YYYY-MM-DD. */
  breakWeek: string;
}

function mondayKey(date: string): string {
  const hit = MONDAYS.get(date);
  if (hit) return hit;
  const t = Date.parse(`${date}T00:00:00Z`);
  const back = (new Date(t).getUTCDay() + 6) % 7;
  const monday = new Date(t - back * 86_400_000).toISOString().slice(0, 10);
  if (MONDAYS.size > 20_000) MONDAYS.clear();
  MONDAYS.set(date, monday);
  return monday;
}
/** Dates already resolved: the replay reads the same sessions on every day it walks. */
const MONDAYS = new Map<string, string>();

/** Completed Monday-to-Friday weeks before the week holding `asOf`. */
function completedWeeks(daily: Bar[], asOf: Date): { key: string; h: number; l: number; c: number }[] {
  const thisWeek = mondayKey(etDateKey(asOf));
  const out: { key: string; h: number; l: number; c: number }[] = [];
  for (const b of daily) {
    const key = mondayKey(etDateKey(new Date(b.t)));
    if (key >= thisWeek) break;
    const last = out[out.length - 1];
    if (last?.key === key) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
    } else out.push({ key, h: b.h, l: b.l, c: b.c });
  }
  return out;
}

export function readFalseBreakout(daily: Bar[], asOf: Date): FalseBreakoutReading | null {
  const weeks = completedWeeks(daily, asOf);
  const n = weeks.length;
  if (n < FALSE_BREAKOUT_RANGE_WEEKS + 2) return null;
  const range = weeks.slice(n - 2 - FALSE_BREAKOUT_RANGE_WEEKS, n - 2);
  const top = Math.max(...range.map((w) => w.h));
  const bottom = Math.min(...range.map((w) => w.l));
  const brk = weeks[n - 2];
  const next = weeks[n - 1];
  if (brk.h > top && brk.h <= top + gannThreePoints(top) && next.c < top) {
    return { direction: "bearish", level: top, extreme: brk.h, breakWeek: brk.key };
  }
  if (brk.l < bottom && brk.l >= bottom - gannThreePoints(bottom) && next.c > bottom) {
    return { direction: "bullish", level: bottom, extreme: brk.l, breakWeek: brk.key };
  }
  return null;
}
