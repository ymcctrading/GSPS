/**
 * Gann's double and triple tops and bottoms (parity roadmap, "Double and
 * triple tops within a price-scaled band; the 3rd test decides"; *New Stock
 * Trend Detector* and *How to Make Profits in Commodities* p. 53, Tier A).
 *
 * A top tested twice or three times at about the same level is resistance;
 * the third test decides. If the market fails there it is a place to sell (a
 * triple top); if it crosses the level by the allowance it is a buying point,
 * and a double or triple top crossed is a strong breakout. Bottoms mirror.
 *
 * The reading takes the 3-Day Chart's completed tops (bottoms), clusters them
 * within Gann's 3 points, and reports, for the nearest cluster of two or more
 * tests: still testing, crossed, or failed.
 *
 * The band is Gann's own: a low "not 3 points under the old lows" is a test of
 * them, not a break (W006 p.11, 64 against 66; p.24, 40½ against 43;
 * A-LEVELS-06), price-scaled by `pointScale.ts` (until 2026-10-16 it was 1%).
 * "Failed" is a double or triple top (bottom) that price could not pass: the
 * latest swing of its kind, followed by a close back the other side by the 3
 * points (W006 pp.14-15, the 1934 double top; p.44, the third test;
 * A-LEVELS-04). Until 2026-10-16 only a third test could fail.
 *
 * Engineering choices, labelled as such: "crossed" is a close beyond the level
 * by the 3-point allowance within the last `RECENT_SESSIONS`; a level still
 * being tested counts only within `NEAR_PCT` of price; a cluster's band is the
 * allowance at its running mean.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Polarity (the same level is a sell when it holds and a buy when
 *    it breaks; tops and bottoms mirror) and Cause and Effect (each test uses
 *    up the supply standing at the level, which is why the third decides).
 */

import type { Bar } from "@/lib/types";
import { beyondByThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export const RECENT_SESSIONS = 5;
export const NEAR_PCT = 3;

export interface MultipleTestReading {
  kind: "top" | "bottom";
  level: number;
  tests: number;
  state: "testing" | "crossed" | "failed";
  /** Index, in the bars read, of the latest test's swing extreme. */
  lastTestIndex: number;
}

export interface MultipleTopsReading {
  top: MultipleTestReading | null;
  bottom: MultipleTestReading | null;
}

function cluster(prices: number[]): { level: number; tests: number; lastIndexInList: number }[] {
  const out: { level: number; tests: number; lastIndexInList: number }[] = [];
  prices.forEach((p, i) => {
    const hit = out.find((c) => (Math.abs(p - c.level) / c.level) * 100 <= gannThreePointsPct(c.level));
    if (hit) {
      hit.level = (hit.level * hit.tests + p) / (hit.tests + 1);
      hit.tests++;
      hit.lastIndexInList = i;
    } else out.push({ level: p, tests: 1, lastIndexInList: i });
  });
  return out;
}

export function readMultipleTops(daily: Bar[]): MultipleTopsReading {
  const out: MultipleTopsReading = { top: null, bottom: null };
  if (daily.length < 20) return out;
  const pivots = walkSwingChart(daily, THREE_DAY_CHART).pivots;
  const price = daily[daily.length - 1].c;
  const recent = daily.slice(-RECENT_SESSIONS);
  for (const kind of ["top", "bottom"] as const) {
    const ofKind = pivots.filter((p) => p.kind === kind);
    const prices = ofKind.map((p) => p.price);
    const groups = cluster(prices).filter((c) => c.tests >= 2);
    if (groups.length === 0) continue;
    const reading = (c: (typeof groups)[number], state: MultipleTestReading["state"]): MultipleTestReading => ({
      kind,
      level: c.level,
      tests: c.tests,
      state,
      lastTestIndex: ofKind[c.lastIndexInList].index,
    });
    // A failed test is judged on the cluster holding the latest swing of its
    // kind, wherever price is: a failed top stays a top while an older level
    // happens to lie nearer to price (review 13 H1). It failed once a close
    // after its latest test went 3 points back under it (over, for a bottom),
    // and stays failed until a later close passes it by the 3 points or a new
    // swing replaces it (owner card, 2026-10-16, recommended option: a failed
    // top is a top until it is passed).
    // A close exactly on the 3-point line does not count either way: the
    // test needs a close beyond it (an engineering reading of Gann's "3
    // points under", the same strict test as the crossing; review 18 L1).
    // One reading per kind (review 14 M1, a known limit): while that latest
    // cluster reads failed, a nearer cluster price has crossed is not
    // reported, so the card and `multipleTopCrossedWithTrade` show the failed
    // top only. The hold reads the failed top, which is the one it needs.
    const latest = groups.find((c) => c.lastIndexInList === prices.length - 1);
    if (latest) {
      const after = daily.slice(ofKind[latest.lastIndexInList].index + 1);
      const away = (b: Bar) => (kind === "top" ? b.c < beyondByThreePoints(latest.level, -1) : b.c > beyondByThreePoints(latest.level, 1));
      const past = (b: Bar) => (kind === "top" ? b.c > beyondByThreePoints(latest.level, 1) : b.c < beyondByThreePoints(latest.level, -1));
      const back = after.findIndex(away);
      if (back >= 0 && !after.slice(back + 1).some(past)) {
        out[kind] = reading(latest, "failed");
        continue;
      }
    }
    const nearest = groups.reduce((x, y) => (Math.abs(y.level - price) < Math.abs(x.level - price) ? y : x));
    const crossed = kind === "top" ? recent.some((b) => b.c > beyondByThreePoints(nearest.level, 1)) && price > nearest.level : recent.some((b) => b.c < beyondByThreePoints(nearest.level, -1)) && price < nearest.level;
    const state: MultipleTestReading["state"] = crossed ? "crossed" : "testing";
    // A level far from price is history, not a test in progress.
    if (state === "testing" && (Math.abs(price - nearest.level) / nearest.level) * 100 > NEAR_PCT) continue;
    out[kind] = reading(nearest, state);
  }
  return out;
}

/**
 * A failed double or triple top standing against a long, or a failed double
 * or triple bottom against a short (A-LEVELS-04, W006 pp.14-15, 44; fork FL3
 * a, 2026-10-16): "failing to pass an old top is a top". A failed top is
 * always above the price (a close back under it by the 3 points), so it
 * stands in a long's path; the bottom mirrors for shorts. Null when none
 * stands. Read by the scan's hold, the placement check, the replay and the
 * exit rules alike.
 */
export function failedTestAgainst(
  reading: MultipleTopsReading | null | undefined,
  direction: "bullish" | "bearish" | "none",
): MultipleTestReading | null {
  const r = direction === "bullish" ? reading?.top : direction === "bearish" ? reading?.bottom : null;
  return r?.state === "failed" ? r : null;
}

/**
 * The failed test a new trade would have to pass on its way to its first
 * target (the map's FL3 a, "in the trade's path"; reviews 11 H1, 12 M2 and
 * 13 L2, 2026-10-16). Passing a top is a close beyond it by the 3 points, the
 * same test `readMultipleTops` reads a crossing by, so the trade must cross
 * that line between the entry and TP1: the entry short of it (an entry over
 * the top but not past it is still under the top) and TP1 beyond it. A TP1 at
 * the top or within the allowance of it sells at the top, as Gann's range
 * trade does (W006 pp.14-15), and is not held; nor is a failed top above TP1,
 * which Gann's double-bottom buy at a range's foot aims under. Null without a
 * TP1; a caller that cannot know the path passes an unbounded one
 * (`readEntryConfirmationNow`).
 *
 * `crossedLevel` is the level a crossing entry waits to close past by the 3
 * points (Gann's buying point over an old top). When that is the failed top's
 * level or above it, the close the entry waits for is the pass that ends the
 * failure, so it is not held: the crossing is the rule's own way out (found
 * 2026-10-16 when the replay's range breakouts were all held). A crossing of
 * a lower level, the lower second top included, arms short of the pass and is
 * held (review 14 H).
 */
/** Relative float tolerance on the crossed-level comparison. */
export const LEVEL_EPSILON = 1e-9;

export function failedTestInPath(
  reading: MultipleTopsReading | null | undefined,
  direction: "bullish" | "bearish" | "none",
  entry: number | null | undefined,
  takeProfit1: number | null | undefined,
  crossedLevel?: number | null,
): MultipleTestReading | null {
  const failed = failedTestAgainst(reading, direction);
  if (!failed || entry == null || takeProfit1 == null) return null;
  if (crossedLevel != null) {
    // Relative to the level, so float drift in the cluster's running mean
    // (three tests at 42.70 average to 42.70000000000001) does not hold a
    // crossing of the level itself (review 17 M1). Far below a cent at any price.
    const passesIt = direction === "bullish"
      ? crossedLevel >= failed.level * (1 - LEVEL_EPSILON)
      : crossedLevel <= failed.level * (1 + LEVEL_EPSILON);
    if (passesIt) return null;
  }
  const inPath =
    direction === "bullish"
      ? entry < beyondByThreePoints(failed.level, 1) && takeProfit1 > beyondByThreePoints(failed.level, 1)
      : entry > beyondByThreePoints(failed.level, -1) && takeProfit1 < beyondByThreePoints(failed.level, -1);
  return inPath ? failed : null;
}

/** The level a crossing entry waits to close past (`failedTestInPath`'s `crossedLevel`); null for one that rests. */
export function crossingLevelOf(trigger: { kind: string; level: number } | null | undefined): number | null {
  return trigger && trigger.kind === "crossing" ? trigger.level : null;
}
