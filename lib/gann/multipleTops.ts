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
 * within `LEVEL_TEST_TOLERANCE_PCT`, and reports, for the nearest cluster of
 * two or more tests: still testing, crossed, or failed on its third test.
 *
 * Engineering choices, labelled as such: the band is the existing
 * level-test tolerance (1%); "crossed" is a close beyond the level by the
 * lost-motion allowance within the last `RECENT_SESSIONS`; "failed" is a
 * third (or later) test, the latest swing of its kind, followed by a close
 * back below the band's floor; a level still being tested counts only within
 * `NEAR_PCT` of price.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Polarity (the same level is a sell when it holds and a buy when
 *    it breaks; tops and bottoms mirror) and Cause and Effect (each test uses
 *    up the supply standing at the level, which is why the third decides).
 */

import type { Bar } from "@/lib/types";
import { LOST_MOTION_BUFFER_PCT } from "@/lib/gann/entryTrigger";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export const TEST_TOLERANCE_PCT = 1.0;
export const RECENT_SESSIONS = 5;
export const NEAR_PCT = 3;

export interface MultipleTestReading {
  kind: "top" | "bottom";
  level: number;
  tests: number;
  state: "testing" | "crossed" | "failed";
}

export interface MultipleTopsReading {
  top: MultipleTestReading | null;
  bottom: MultipleTestReading | null;
}

function cluster(prices: number[]): { level: number; tests: number; lastIndexInList: number }[] {
  const out: { level: number; tests: number; lastIndexInList: number }[] = [];
  prices.forEach((p, i) => {
    const hit = out.find((c) => (Math.abs(p - c.level) / c.level) * 100 <= TEST_TOLERANCE_PCT);
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
  const a = LOST_MOTION_BUFFER_PCT / 100;
  const recent = daily.slice(-RECENT_SESSIONS);
  for (const kind of ["top", "bottom"] as const) {
    const prices = pivots.filter((p) => p.kind === kind).map((p) => p.price);
    const groups = cluster(prices).filter((c) => c.tests >= 2);
    if (groups.length === 0) continue;
    const nearest = groups.reduce((x, y) => (Math.abs(y.level - price) < Math.abs(x.level - price) ? y : x));
    const band = nearest.level * (TEST_TOLERANCE_PCT / 100);
    let state: MultipleTestReading["state"] = "testing";
    const crossed = kind === "top" ? recent.some((b) => b.c > nearest.level * (1 + a)) && price > nearest.level : recent.some((b) => b.c < nearest.level * (1 - a)) && price < nearest.level;
    if (crossed) state = "crossed";
    else if (
      nearest.tests >= 3 &&
      // The failed test must be the latest swing of its kind, not an old one.
      nearest.lastIndexInList === prices.length - 1 &&
      (kind === "top" ? price < nearest.level - band : price > nearest.level + band)
    ) {
      state = "failed";
    }
    // A level far from price is history, not a test in progress.
    if (state === "testing" && (Math.abs(price - nearest.level) / nearest.level) * 100 > NEAR_PCT) continue;
    out[kind] = { kind, level: nearest.level, tests: nearest.tests, state };
  }
  return out;
}
