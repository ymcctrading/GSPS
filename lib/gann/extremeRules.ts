/**
 * Gann's rules for extreme prices on the daily chart (parity roadmap Stage F1,
 * gaps G20 and G21): the reverse signal day, the 7-to-10 Day Rule, and his gap
 * rules (*How to Make Profits in Commodities*, 1951, pp. 311, 317-325; Tier A).
 *
 * - **Reverse signal day.** At a top: a day that opens above the prior high,
 *   makes a new high and closes near its low. Mirror at a bottom.
 * - **7-to-10 Day Rule.** After 7 to 10 days (up to 14) in which no day broke
 *   the prior day's low, the first day that does, and closes near its low, is
 *   a signal of a top. Mirror at a bottom.
 * - **Gaps.** An exhaust gap is a final one-day gap after a prolonged move
 *   together with a reverse signal day (p. 319; mirrored on the downside,
 *   p. 320). Three or four consecutive gaps in new territory mean a reverse
 *   move is near, but often there are 6 to 7 before a culmination and in
 *   extreme cases 10 (p. 321), so 6 or more is flagged as extended. A filled
 *   gap reverses the minor trend only.
 *
 *   Corrected 2026-10-16 (M-E12): the exhaust gap used to mean a gap filled
 *   the next day, which is not in Gann's text; it now needs the reverse
 *   signal day he names. Context only, as before.
 *
 * Gann says to apply these together in very active markets and to confirm
 * them with over-balanced price and time. So they are context and measured
 * factors here (`contextFactors.ts`), never a gate, until the replay has
 * measured them ("confluence first", roadmap G21).
 *
 * Engineering choices, labelled as such: "closes near its low" means the
 * close sits in the bottom quarter of the day's range (`NEAR_EXTREME`); "new
 * territory" means a new high (low) of the last `NEW_TERRITORY_BARS` bars;
 * gaps are counted since the last completed 3-Day Chart pivot on the other
 * side; the reverse signal day may be the gap day itself or the day after it
 * (Gann pairs them without saying which day), and only his reverse day counts,
 * not the 7-10 Day Rule; "prolonged" is read as the gap reaching a new
 * extreme of `NEW_TERRITORY_BARS` bars. Limit days are commodity-exchange rules with no equity counterpart and
 * are not built.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: the 7-10 (up to 14) day run is a duration claim; no Dewey item is
 *    cleared yet, which is why this measures before it acts.
 * 3. Hermetic: Polarity (every rule has its mirror) and Cause and Effect (a
 *    gap left open is an imbalance; filling it is the effect that reverses
 *    the minor move).
 */

import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export const NEAR_EXTREME = 0.25;
export const NEW_TERRITORY_BARS = 20;
export const SEVEN_TO_TEN_MIN_DAYS = 7;
export const SEVEN_TO_TEN_MAX_DAYS = 14;
/** "As many as 6 to 7 GAPS before a culmination and in extreme cases as many as 10" (Commodities p.321). */
export const EXTENDED_GAP_COUNT = 6;

export type ExtremeSignal = "top" | "bottom";

export interface ReverseSignalReading {
  signal: ExtremeSignal | null;
  rule: "reverseDay" | "sevenToTenDay" | null;
  /** For the 7-10 Day Rule: how many days ran without breaking the prior day's low (high). */
  runDays: number | null;
}

export interface GapReading {
  /** A one-day gap to a new extreme on one of the last two bars, with a reverse signal day on it or the bar after (Commodities p.319). */
  exhaustGap: ExtremeSignal | null;
  /**
   * Gaps in the current swing's direction, each at a new extreme, since the
   * last opposite pivot. `extended`: 6 or more, past the usual 3-4 (Commodities p.321).
   */
  gapsInNewTerritory: { direction: "up" | "down"; count: number; extended: boolean } | null;
  /** A gap from the last 10 bars that has since been filled: the minor trend reverses against it. */
  filledGapReversal: "bullish" | "bearish" | null;
}

export interface ExtremeRulesReading {
  reverseSignal: ReverseSignalReading;
  gaps: GapReading;
}

const nearLow = (b: Bar) => b.h > b.l && (b.c - b.l) / (b.h - b.l) <= NEAR_EXTREME;
const nearHigh = (b: Bar) => b.h > b.l && (b.h - b.c) / (b.h - b.l) <= NEAR_EXTREME;

export function readReverseSignal(bars: Bar[]): ReverseSignalReading {
  const none: ReverseSignalReading = { signal: null, rule: null, runDays: null };
  if (bars.length < 3) return none;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  if (last.o > prev.h && last.h > prev.h && nearLow(last)) return { signal: "top", rule: "reverseDay", runDays: null };
  if (last.o < prev.l && last.l < prev.l && nearHigh(last)) return { signal: "bottom", rule: "reverseDay", runDays: null };

  // 7-to-10 Day Rule: count the run before the last bar in which no day broke
  // the prior day's low (for a top) or high (for a bottom).
  const run = (broke: (b: Bar, p: Bar) => boolean) => {
    let n = 0;
    for (let i = bars.length - 2; i >= 1 && !broke(bars[i], bars[i - 1]); i--) n++;
    return n;
  };
  const upRun = run((b, p) => b.l < p.l);
  if (last.l < prev.l && nearLow(last) && upRun >= SEVEN_TO_TEN_MIN_DAYS && upRun <= SEVEN_TO_TEN_MAX_DAYS) {
    return { signal: "top", rule: "sevenToTenDay", runDays: upRun };
  }
  const downRun = run((b, p) => b.h > p.h);
  if (last.h > prev.h && nearHigh(last) && downRun >= SEVEN_TO_TEN_MIN_DAYS && downRun <= SEVEN_TO_TEN_MAX_DAYS) {
    return { signal: "bottom", rule: "sevenToTenDay", runDays: downRun };
  }
  return none;
}

function isNewHigh(bars: Bar[], i: number): boolean {
  const from = Math.max(0, i - NEW_TERRITORY_BARS);
  return bars.slice(from, i).every((b) => b.h < bars[i].h);
}
function isNewLow(bars: Bar[], i: number): boolean {
  const from = Math.max(0, i - NEW_TERRITORY_BARS);
  return bars.slice(from, i).every((b) => b.l > bars[i].l);
}

export function readGaps(bars: Bar[]): GapReading {
  const out: GapReading = { exhaustGap: null, gapsInNewTerritory: null, filledGapReversal: null };
  const n = bars.length;
  if (n < 3) return out;

  // Exhaust gap (p.319): a gap to a new extreme on bar g (one of the last
  // two), and a reverse signal day on g or the bar after it.
  const reverseDayAt = (i: number) => {
    const r = readReverseSignal(bars.slice(0, i + 1));
    return r.rule === "reverseDay" ? r.signal : null;
  };
  for (const g of [n - 1, n - 2]) {
    if (out.exhaustGap || g < 1) continue;
    const up = bars[g].l > bars[g - 1].h && isNewHigh(bars, g);
    const down = bars[g].h < bars[g - 1].l && isNewLow(bars, g);
    if (!up && !down) continue;
    const want: ExtremeSignal = up ? "top" : "bottom";
    for (let r = g; r <= Math.min(g + 1, n - 1); r++) if (reverseDayAt(r) === want) out.exhaustGap = want;
  }

  // Gaps in new territory since the last opposite 3-Day Chart pivot.
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;
  const lastBottom = [...pivots].reverse().find((p) => p.kind === "bottom")?.index ?? 0;
  const lastTop = [...pivots].reverse().find((p) => p.kind === "top")?.index ?? 0;
  let up = 0;
  let down = 0;
  for (let i = Math.max(1, lastBottom + 1); i < n; i++) if (bars[i].l > bars[i - 1].h && isNewHigh(bars, i)) up++;
  for (let i = Math.max(1, lastTop + 1); i < n; i++) if (bars[i].h < bars[i - 1].l && isNewLow(bars, i)) down++;
  if (up > 0 || down > 0) {
    const [direction, count] = up >= down ? (["up", up] as const) : (["down", down] as const);
    out.gapsInNewTerritory = { direction, count, extended: count >= EXTENDED_GAP_COUNT };
  }

  // A filled gap from the last 10 bars reverses the minor trend against it.
  for (let i = n - 2; i >= Math.max(1, n - 10); i--) {
    const upGap = bars[i].l > bars[i - 1].h;
    const downGap = bars[i].h < bars[i - 1].l;
    if (!upGap && !downGap) continue;
    const after = bars.slice(i + 1);
    if (upGap && after.some((b) => b.l <= bars[i - 1].h)) out.filledGapReversal = "bearish";
    else if (downGap && after.some((b) => b.h >= bars[i - 1].l)) out.filledGapReversal = "bullish";
    break; // only the most recent gap counts
  }
  return out;
}

export function readExtremeRules(bars: Bar[]): ExtremeRulesReading {
  return { reverseSignal: readReverseSignal(bars), gaps: readGaps(bars) };
}
