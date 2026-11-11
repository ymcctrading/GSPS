/**
 * Do the price rules in the owner's two YouTube Shorts of 2026-11-04 mark the
 * start of a move? Research only: nothing on the verdict path imports this
 * module, and nothing here reaches a member.
 *
 * The two Shorts (transcripts read in full on 2026-11-04, auto captions):
 * - stK5ZVlzaXo, "Dr. David Paul Reveals Gann's Most Powerful Charting Tip"
 *   (ComLucro Trader, 33 s): "the most important part of a chart is the
 *   lowest tick of the highest bar and the highest tick of the lowest bar".
 *   The rest is that the mechanical method is simple and the forecasting
 *   needs "squaring the charts", which gives no rule (the square of price as
 *   days was scored on 2026-10-30, `videoTimeRules.ts`).
 * - e4zpCMBbJ_E, "Trading Strategy (Gann Fan) with 45 degree" (Arjun_Trader,
 *   23 s): find a 45-degree angle on a recent swing high, draw the Gann fan on
 *   it, "when the price breaks above these lines ... it is about to reverse
 *   back up", and "when the price goes above this line, you should be looking
 *   for take profits".
 *
 * Fixed from the Shorts before any bar was scored:
 * - topBreak (stK5ZVlzaXo): the highest bar is a session whose high is the
 *   highest of the `SIDE` sessions before it; the signal is the first close
 *   below that bar's low within `SIDE` sessions, with no higher high in
 *   between. It calls the top, so the move scored is down.
 * - bottomBreak (stK5ZVlzaXo): the mirror, the first close above the high of
 *   a bar whose low is the lowest of the `SIDE` sessions before it, with no
 *   lower low in between. The move scored is up.
 * - fanBreak (e4zpCMBbJ_E): the 1x1 down from the latest major high (the
 *   highest high of `SIDE` sessions on each side, so only known `SIDE`
 *   sessions after it), falling one Gann point a session
 *   (`pointScale.ts#pricePoint` at the high's price, the scale every GSPS fan
 *   uses, standing in for the Short's "perfect 45 degree", which is a chart
 *   zoom). The signal is the first close above the line after a close below
 *   it, the crossing itself on or after the day the high is known. The move scored is up.
 *   Descriptive only: the share of signals that close above the 2x1 down
 *   from the same high (half a point a session, the next line up and the
 *   Short's "take profits" line) within `SIDE` sessions.
 * - fanFit (e4zpCMBbJ_E, added after the first run): at Gann's scale the 1x1
 *   down falls 0.3% to 0.7% a session, faster than nearly every decline, so
 *   fanBreak fired once in each of SPY, DIA and the 1913-1948 Dow. The Short
 *   instead sets the 45 degrees on the swing itself, so here the 1x1 runs
 *   from the major high through the lowest close before the day the high is
 *   known; the signal is the first close above that fan's 2x1 (the line
 *   above price after the low), crossing on or after that day, and the take
 *   profit its 4x1. Chosen after fanBreak's signal count was seen and before
 *   fanFit was scored, which the record says.
 *
 * Outcome: the close-to-close return over 5, 10 and 21 sessions from the
 * signal's close, in the signal's direction. Null, in the spirit of the
 * timing tests (same count and spacing, only the placement tested): the same
 * signal dates shifted round the series by a random offset, `DRAWS` times,
 * with a seeded generator so the run repeats. p is one-sided: the share of
 * shifted sets whose mean return is at least the signals' own.
 *
 * Series: SPY and DIA daily bars 2016-2025 (Alpaca, split-adjusted, SIP) for
 * all three rules; the Dow's daily closes (MeasuringWorth, owner-private, read
 * from the project folder and never committed) for fanBreak only, in his
 * years 1913-1948 and after, 1949-2025. The Dow file has closes only, so the
 * highest bar's low is not in it and topBreak and bottomBreak cannot be read
 * there; on closes the fan's high is the highest close. 12 rule and series
 * pairs, 3 horizons: 36 tests, so a result needs p below 0.05 / 36 ≈ 0.0014.
 *
 * Engineering choices, labelled as such: `SIDE` = 21 sessions (the major
 * turn's width in `build-modern-turns.mjs`), the horizons, the 2x1 as the
 * take-profit line, and the shifted-date null.
 *
 * Three-question basis:
 * 1. Gann: the highest bar's low is the level the 1-day swing chart
 *    (`swingChart.ts`) and his "crossing old tops and bottoms"
 *    (`entryTrigger.ts`, ref: SRC-005, Tier A) read at a single bar's scale; GSPS
 *    reads it at the swing's scale, on his word that a bar's extreme is the
 *    noise the swing chart filters. The fan and its 1x1 from a top are his
 *    (ref: SRC-001 Ch.4, Tier A, `fans.ts`); breaking up through the 1x1
 *    from a top as a sign the trend has turned is in the same chapter. The
 *    Shorts' versions are tested as stated.
 * 2. Cycles: Dewey's base-rate rule on rules fixed first, with a correction
 *    for the 36 tests; the Dow's two eras are the out-of-sample check for the
 *    fan.
 * 3. Hermetic: Polarity (each top's line has its bottom's mirror), held as
 *    the shape of the test, never as evidence.
 */
import { pricePoint } from "@/lib/gann/pointScale";

export interface DayBar {
  /** YYYY-MM-DD */
  t: string;
  h: number;
  l: number;
  c: number;
}

export const SIDE = 21;
export const HORIZONS = [5, 10, 21] as const;
export const DRAWS = 10_000;
export const SHORT_RULES = ["topBreak", "bottomBreak", "fanBreak", "fanFit"] as const;
export type ShortRule = (typeof SHORT_RULES)[number];

export interface Signal {
  index: number;
  /** +1 scores the move up, -1 the move down. */
  direction: 1 | -1;
  /** The fan rules only: whether a close above the take-profit line followed within SIDE sessions. */
  reachedTakeProfit?: boolean;
}

/** topBreak / bottomBreak: the first close through the extreme bar's opposite end. */
export function extremeBarBreaks(bars: DayBar[], kind: "top" | "bottom"): Signal[] {
  const out: Signal[] = [];
  const top = kind === "top";
  const seen = new Set<number>();
  for (let x = SIDE; x < bars.length; x++) {
    let isExtreme = true;
    for (let k = x - SIDE; k < x; k++) {
      if (top ? bars[k].h >= bars[x].h : bars[k].l <= bars[x].l) {
        isExtreme = false;
        break;
      }
    }
    if (!isExtreme) continue;
    const line = top ? bars[x].l : bars[x].h;
    for (let s = x + 1; s < bars.length && s <= x + SIDE; s++) {
      // A new extreme before the break ends this bar's watch.
      if (top ? bars[s].h > bars[x].h : bars[s].l < bars[x].l) {
        // An outside bar that also closes through the line still counts as the break.
        if (!(top ? bars[s].c < line : bars[s].c > line)) break;
      }
      if (top ? bars[s].c < line : bars[s].c > line) {
        if (!seen.has(s)) {
          out.push({ index: s, direction: top ? -1 : 1 });
          seen.add(s);
        }
        break;
      }
    }
  }
  return out.sort((p, q) => p.index - q.index);
}

/** The major highs: the highest high of `SIDE` sessions on each side (first of equal highs). */
export function majorHighs(bars: DayBar[]): number[] {
  const majors: number[] = [];
  for (let i = SIDE; i + SIDE < bars.length; i++) {
    let ok = true;
    for (let k = i - SIDE; k <= i + SIDE && ok; k++) if (k !== i && bars[k].h > bars[i].h) ok = false;
    for (let k = i - SIDE; k < i && ok; k++) if (bars[k].h === bars[i].h) ok = false;
    if (ok) majors.push(i);
  }
  return majors;
}

/**
 * The fan down from each confirmed major high. `slope` gives the 1x1's fall
 * per session (null skips the high); the signal is the first close above the
 * `entryRatio` line (the 1x1 for 1, the 2x1 for 1/2) crossing on or after the
 * day the high is known, and the take profit is the next flatter line.
 */
function fanSignals(
  bars: DayBar[],
  slope: (a: number, known: number) => number | null,
  entryRatio: number,
): Signal[] {
  const majors = majorHighs(bars);
  const out: Signal[] = [];
  for (let m = 0; m < majors.length; m++) {
    const a = majors[m];
    const known = a + SIDE;
    if (known >= bars.length) break;
    const end = m + 1 < majors.length ? majors[m + 1] + SIDE : bars.length;
    const unit = slope(a, known);
    if (unit === null || !(unit > 0)) continue;
    const line = (s: number, perSession: number) => bars[a].h - perSession * (s - a);
    const entry = unit * entryRatio;
    let prevUnder = false;
    for (let s = a + 1; s < end; s++) {
      const under = bars[s].c < line(s, entry);
      // The crossing itself must fall on or after the day the high is known.
      if (s >= known && prevUnder && !under) {
        let reached = false;
        for (let u = s; u < bars.length && u <= s + SIDE; u++) {
          if (bars[u].c > line(u, entry / 2)) {
            reached = true;
            break;
          }
        }
        out.push({ index: s, direction: 1, reachedTakeProfit: reached });
        break;
      }
      prevUnder = under;
    }
  }
  return out;
}

/** fanBreak: the 1x1 at one Gann point a session from the latest confirmed major high. */
export function fanBreaks(bars: DayBar[]): Signal[] {
  return fanSignals(bars, (a) => pricePoint(bars[a].h), 1);
}

/**
 * fanFit: the fan scaled to the swing, the 1x1 through the lowest close
 * between the high and the day it is known; the signal is the first close
 * above that fan's 2x1, the take profit its 4x1.
 */
export function fanFitBreaks(bars: DayBar[]): Signal[] {
  return fanSignals(
    bars,
    (a, known) => {
      let low = a + 1;
      for (let k = a + 1; k <= known; k++) if (bars[k].c < bars[low].c) low = k;
      const fall = bars[a].h - bars[low].c;
      return fall > 0 ? fall / (low - a) : null;
    },
    1 / 2,
  );
}

export function signalsFor(rule: ShortRule, bars: DayBar[]): Signal[] {
  if (rule === "topBreak") return extremeBarBreaks(bars, "top");
  if (rule === "bottomBreak") return extremeBarBreaks(bars, "bottom");
  if (rule === "fanFit") return fanFitBreaks(bars);
  return fanBreaks(bars);
}

/** Mulberry32: a small seeded generator so a run repeats exactly. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShortScore {
  rule: ShortRule;
  series: string;
  horizon: number;
  signals: number;
  /** Mean return of the signals in their direction, percent. */
  meanPct: number;
  /** Mean of the shifted sets' means, percent. */
  nullMeanPct: number;
  /** Share of signals whose return in their direction was positive. */
  hitRate: number;
  /** Share of all sessions whose return in that direction was positive. */
  baseRate: number;
  p: number;
  /** The fan rules only. */
  takeProfitRate?: number;
}

function fwd(bars: DayBar[], i: number, h: number, dir: 1 | -1): number {
  return (dir * (bars[i + h].c - bars[i].c)) / bars[i].c;
}

export function scoreSignals(
  rule: ShortRule,
  series: string,
  bars: DayBar[],
  signals: Signal[],
  horizon: number,
  draws = DRAWS,
  seed = 20261104,
): ShortScore {
  const n = bars.length - horizon; // sessions with a full horizon after them
  const sig = signals.filter((s) => s.index < n);
  const dir: 1 | -1 = rule === "topBreak" ? -1 : 1;
  const mean = (idx: number[]) => idx.reduce((t, i) => t + fwd(bars, i, horizon, dir), 0) / idx.length;
  const own = sig.length ? mean(sig.map((s) => s.index)) : NaN;
  let base = 0;
  for (let i = 0; i < n; i++) if (fwd(bars, i, horizon, dir) > 0) base++;
  const rand = seeded(seed + horizon);
  let atLeast = 0;
  let nullSum = 0;
  for (let d = 0; d < draws && sig.length; d++) {
    const shift = 1 + Math.floor(rand() * (n - 1));
    const m = mean(sig.map((s) => (s.index + shift) % n));
    nullSum += m;
    if (m >= own) atLeast++;
  }
  const tp = sig.filter((s) => s.reachedTakeProfit !== undefined);
  return {
    rule,
    series,
    horizon,
    signals: sig.length,
    meanPct: own * 100,
    nullMeanPct: sig.length ? (nullSum / draws) * 100 : NaN,
    hitRate: sig.length ? sig.filter((s) => fwd(bars, s.index, horizon, dir) > 0).length / sig.length : NaN,
    baseRate: n > 0 ? base / n : NaN,
    p: sig.length ? (atLeast + 1) / (draws + 1) : NaN,
    ...(tp.length ? { takeProfitRate: tp.filter((s) => s.reachedTakeProfit).length / tp.length } : {}),
  };
}

/** Which rules each series can carry: close-only series carry the fan alone. */
export function rulesFor(closeOnly: boolean): ShortRule[] {
  return closeOnly ? ["fanBreak", "fanFit"] : [...SHORT_RULES];
}

export function scoreSeries(series: string, bars: DayBar[], closeOnly: boolean, draws = DRAWS): ShortScore[] {
  const out: ShortScore[] = [];
  for (const rule of rulesFor(closeOnly)) {
    const signals = signalsFor(rule, bars);
    for (const h of HORIZONS) out.push(scoreSignals(rule, series, bars, signals, h, draws));
  }
  return out;
}
