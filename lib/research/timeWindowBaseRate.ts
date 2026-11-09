/**
 * Base rates for GSPS's class A time windows (item 7 step 6; CYC-24, CYC-51).
 * Research only: nothing here feeds a verdict. It is the measurement the item
 * 7 map puts before any time window may hold a setup (fork F1 b).
 *
 * Question: do the windows `timeCycles` opens from a symbol's own major pivots
 * (the 1-, 2- and 3-year anniversaries, A-TIME-04; the wheel's day counts;
 * the day-count bands) catch that symbol's later turns more often than the
 * same windows moved to other days? And how much of the calendar do they
 * cover, which is what a gate on "a window is active" would really be
 * selecting on (CYC-51)?
 *
 * Fixed before any data is read (deviations go in the run notes, not here):
 * - Universe: `LARGE_CAP_UNIVERSE`, daily bars from the provider's earliest
 *   (asked from 2000-01-01); a symbol with fewer than 750 sessions is skipped.
 * - Anchors are the record's major pivots, `majorPivots(findPivots(daily, 5))`,
 *   the anchors `timeCycles` uses, taken over the whole record.
 * - Turns are completed pivots of Gann's weekly swing chart on the same daily
 *   bars, as in the F4 calendar test.
 * - A window is the count's date ±2 days (`timeCycles`' window), or the
 *   band's days; it catches a turn when a turn's session falls inside it.
 * - Only windows lying wholly inside the record are scored.
 * - The statistic is the share of windows that catch at least one turn,
 *   pooled over every symbol.
 * - The base rate moves every window forward by s days, s = 1..364, keeping
 *   those still inside the record; p = (shifts scoring ≥ observed + 1) / 365.
 * - Holm–Bonferroni across the six families at family-wise 0.05. The sixth,
 *   the long cycles' anniversaries, was added 2026-10-16 (batch review C1) so
 *   the shortlist's year-cycle re-rank is corrected with the rest.
 * - Reading rule: a family beats placement at random only if it is
 *   Holm-significant and its hit rate is above the shifted mean. Otherwise it
 *   stays context, and no hold may be built on it.
 *
 * Two calendar-only families are scored apart, as a second pre-registered
 * set with its own Holm correction (CYC-24, added 2026-10-16), so the six
 * families above keep the correction they were registered with:
 * - `macroCycle`: every month a major (5-year-plus) cycle from the cited DJIA
 *   turns lands in (`macroCycle.ts`), the whole month as the window.
 * - `decadeNinetiethMonth`: the decade's 90th month in each '8' year
 *   (`decadeCycle.ts`), the whole month.
 * Both are the same dates for every symbol, so each symbol's own turns are
 * scored against them with the same circular-shift base rate.
 *
 * CYC-39 (Halberg, W041 p. 18, feedsidewards): the same input can act
 * differently by phase, and `timeCycles` fixes a window's direction by its
 * anchor (a low argues bullish). `hitsByTurnDirection` reports each family's
 * hits split by the turn that actually came (top or bottom) and by anchor
 * kind, instead of assuming it. `timeWindow.ts`'s hold is unchanged.
 *
 * Three-question basis. Gann: the windows are his (A-TIME-04, W006 pp.14, 44;
 * the wheel and bands in `timeCycles.ts`). Cycles: Dewey's recurrent-event
 * statistic (a hit rate against a base rate, CYC-24) and a correction for
 * testing a family (CYC-51); his repetition count is the instance total.
 * Hermetic: Rhythm, whether a pivot's returning dates carry the turns.
 */
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { DAY_COUNT_BANDS, MAJOR_CYCLE_YEARS, WHEEL_COUNTS } from "@/lib/gann/timeCycles";
import { holm } from "@/lib/research/calendarTest";
import { computeMacroCycle } from "@/lib/gann/macroCycle";
import { computeDecadeCycle } from "@/lib/gann/decadeCycle";

const DAY = 86_400_000;
/** `timeCycles`' default window, in days either side. */
export const WINDOW_DAYS = 2;
export const SHIFTS = 364;

export const WINDOW_FAMILIES = ["anniversary1", "anniversary2", "anniversary3", "wheel", "dayBands", "yearCycles"] as const;
/**
 * The shortlist's year-cycle re-rank, as `yearCycleConvergence` reads it
 * (CYC-51; reviews C1 and 20): the major pivots of the monthly chart
 * (`majorPivots(findPivots(monthly, 3))`), each cycle of `MAJOR_CYCLE_YEARS`
 * after one, and the whole calendar month it lands in as the window.
 */
export const YEAR_CYCLE_FAMILY_YEARS: readonly number[] = MAJOR_CYCLE_YEARS;

/** Daily bars rolled into calendar months (the monthly chart the re-rank reads). */
function monthsOf(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of daily) {
    const last = out[out.length - 1];
    if (last && last.t.slice(0, 7) === b.t.slice(0, 7)) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else out.push({ ...b });
  }
  return out;
}
export type WindowFamily = (typeof WINDOW_FAMILIES)[number];

export interface SymbolWindows {
  /** Session dates as UTC-midnight ms, ascending. */
  sessions: number[];
  /** Indices into `sessions` of completed weekly-swing-chart pivots. */
  turns: number[];
  /** Each family's windows, [start, end] in UTC-midnight ms, inside the record. */
  windows: Record<WindowFamily, [number, number][]>;
  /** The kind of each turn in `turns` (CYC-39). */
  turnKinds?: ("top" | "bottom")[];
  /** The kind of pivot each window was counted from, parallel to `windows` (CYC-39). */
  anchorKinds?: Partial<Record<WindowFamily, ("low" | "high")[]>>;
}

const midnight = (t: string) => Date.parse(`${t.slice(0, 10)}T00:00:00Z`);

export function symbolWindows(daily: Bar[]): SymbolWindows {
  const sessions = daily.map((b) => midnight(b.t));
  const walk = walkSwingChart(daily, WEEKLY_SWING_CHART);
  const done = walk.pivots.slice(0, -1);
  const turns = done.map((p) => p.index);
  const turnKinds = done.map((p) => p.kind);
  const first = sessions[0] ?? 0;
  const last = sessions[sessions.length - 1] ?? 0;
  const windows: Record<WindowFamily, [number, number][]> = { anniversary1: [], anniversary2: [], anniversary3: [], wheel: [], dayBands: [], yearCycles: [] };
  const anchorKinds: Record<WindowFamily, ("low" | "high")[]> = { anniversary1: [], anniversary2: [], anniversary3: [], wheel: [], dayBands: [], yearCycles: [] };
  let kind: "low" | "high" = "low";
  const keep = (family: WindowFamily, w: [number, number]) => {
    if (w[0] >= first && w[1] <= last) {
      windows[family].push(w);
      anchorKinds[family].push(kind);
    }
  };
  for (const a of majorPivots(findPivots(daily, 5))) {
    kind = a.kind;
    const at = midnight(a.bar.t);
    for (const k of [1, 2, 3] as const) {
      const d = new Date(at);
      d.setUTCFullYear(d.getUTCFullYear() + k);
      keep(`anniversary${k}`, [d.getTime() - WINDOW_DAYS * DAY, d.getTime() + WINDOW_DAYS * DAY]);
    }
    for (const c of WHEEL_COUNTS) keep("wheel", [at + (c - WINDOW_DAYS) * DAY, at + (c + WINDOW_DAYS) * DAY]);
    for (const [lo, hi] of DAY_COUNT_BANDS) keep("dayBands", [at + lo * DAY, at + hi * DAY]);
  }
  for (const a of majorPivots(findPivots(monthsOf(daily), 3))) {
    kind = a.kind;
    const d = new Date(a.bar.t);
    for (const y of YEAR_CYCLE_FAMILY_YEARS) {
      const from = Date.UTC(d.getUTCFullYear() + y, d.getUTCMonth(), 1);
      const to = Date.UTC(d.getUTCFullYear() + y, d.getUTCMonth() + 1, 1) - DAY;
      keep("yearCycles", [from, to]);
    }
  }
  return { sessions, turns, windows, turnKinds, anchorKinds };
}

/** Whether a turn's session lies in [start, end]. `turnDays` holds the turns' session dates. */
function caught(turnDays: number[], w: [number, number]): boolean {
  let lo = 0;
  let hi = turnDays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (turnDays[mid] < w[0]) lo = mid + 1;
    else hi = mid;
  }
  return lo < turnDays.length && turnDays[lo] <= w[1];
}

export interface FamilyResult {
  family: WindowFamily;
  symbols: number;
  instances: number;
  hits: number;
  hitRate: number;
  /** Mean hit rate over the 364 shifts. */
  baseMean: number;
  p: number;
  /** Share of sessions inside at least one of the family's windows (pooled). */
  coverage: number;
  holmSignificant?: boolean;
  /** The reading rule: Holm-significant and above the shifted mean. */
  beatsRandom?: boolean;
}

/** The circular-shift score of one set of windows per series. */
function scoreWindows(series: { sessions: number[]; turns: number[]; windows: [number, number][] }[]) {
  const prepared = series.map((s) => ({
    turnDays: s.turns.map((i) => s.sessions[i]).sort((a, b) => a - b),
    last: s.sessions[s.sessions.length - 1] ?? 0,
    windows: s.windows,
  }));
  const rateAt = (shift: number) => {
    let n = 0;
    let h = 0;
    for (const p of prepared) {
      for (const w of p.windows) {
        const moved: [number, number] = [w[0] + shift * DAY, w[1] + shift * DAY];
        if (moved[1] > p.last) continue;
        n++;
        if (caught(p.turnDays, moved)) h++;
      }
    }
    return { n, h };
  };
  const obs = rateAt(0);
  const observed = obs.n > 0 ? obs.h / obs.n : 0;
  let atLeast = 0;
  let sum = 0;
  for (let s = 1; s <= SHIFTS; s++) {
    const r = rateAt(s);
    const rate = r.n > 0 ? r.h / r.n : 0;
    sum += rate;
    if (rate >= observed) atLeast++;
  }
  return {
    symbols: series.filter((s) => s.windows.length > 0).length,
    instances: obs.n,
    hits: obs.h,
    hitRate: observed,
    baseMean: sum / SHIFTS,
    p: (atLeast + 1) / (SHIFTS + 1),
  };
}

export function scoreFamily(series: SymbolWindows[], family: WindowFamily): FamilyResult {
  return {
    family,
    ...scoreWindows(series.map((s) => ({ sessions: s.sessions, turns: s.turns, windows: s.windows[family] }))),
    coverage: coverage(series, [family]),
  };
}

/** Share of sessions, pooled over the series, inside at least one window of `families`. */
export function coverage(series: SymbolWindows[], families: readonly WindowFamily[]): number {
  let inside = 0;
  let total = 0;
  for (const s of series) {
    const ws = families.flatMap((f) => s.windows[f]);
    for (const t of s.sessions) {
      total++;
      if (ws.some((w) => t >= w[0] && t <= w[1])) inside++;
    }
  }
  return total > 0 ? inside / total : 0;
}

export interface BaseRateReport {
  families: FamilyResult[];
  /** Share of sessions inside any of the families' windows: what "a window is active" selects. */
  coverageAll: number;
}

export function readBaseRates(series: SymbolWindows[]): BaseRateReport {
  const families = holm(WINDOW_FAMILIES.map((f) => scoreFamily(series, f)));
  for (const f of families) f.beatsRandom = f.holmSignificant === true && f.hitRate > f.baseMean;
  return { families, coverageAll: coverage(series, WINDOW_FAMILIES) };
}

// ---------------------------------------------------------------------------
// CYC-24: the calendar-only families (macro cycle, the decade's 90th month)

export const CALENDAR_FAMILIES = ["macroCycle", "decadeNinetiethMonth"] as const;
export type CalendarFamily = (typeof CALENDAR_FAMILIES)[number];

/** Whole calendar months [first day, last day], UTC ms. */
const monthWindow = (y: number, m: number): [number, number] => [Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1) - DAY];

/** Each calendar family's months wholly inside the sessions' record. */
export function calendarFamilyWindows(sessions: number[]): Record<CalendarFamily, [number, number][]> {
  const out: Record<CalendarFamily, [number, number][]> = { macroCycle: [], decadeNinetiethMonth: [] };
  if (sessions.length === 0) return out;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const d0 = new Date(first);
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); Date.UTC(y, m, 1) <= last; m === 11 ? ((m = 0), y++) : m++) {
    const w = monthWindow(y, m);
    if (w[0] < first || w[1] > last) continue;
    const at = new Date(Date.UTC(y, m, 15));
    if (computeMacroCycle(at, 0).majorActive) out.macroCycle.push(w);
    if (computeDecadeCycle(at).ninetiethMonth?.active) out.decadeNinetiethMonth.push(w);
  }
  return out;
}

export interface CalendarFamilyResult extends Omit<FamilyResult, "family" | "coverage" | "beatsRandom"> {
  family: CalendarFamily;
  beatsRandom?: boolean;
}

/** Both calendar families scored on each series' own turns, Holm across the two. */
export function readCalendarBaseRates(series: { sessions: number[]; turns: number[] }[]): CalendarFamilyResult[] {
  const windows = series.map((s) => calendarFamilyWindows(s.sessions));
  const results = holm(
    CALENDAR_FAMILIES.map((family) => ({
      family,
      ...scoreWindows(series.map((s, k) => ({ sessions: s.sessions, turns: s.turns, windows: windows[k][family] }))),
    })) as CalendarFamilyResult[],
  );
  for (const r of results) r.beatsRandom = r.holmSignificant === true && r.hitRate > r.baseMean;
  return results;
}

// ---------------------------------------------------------------------------
// CYC-39: hits split by the turn that came

export interface TurnDirectionHits {
  windows: number;
  caughtTops: number;
  caughtBottoms: number;
}

/** A family's windows by anchor kind, and how many caught a top and how many a bottom. */
export function hitsByTurnDirection(series: SymbolWindows[], family: WindowFamily): { fromLows: TurnDirectionHits; fromHighs: TurnDirectionHits } {
  const fromLows: TurnDirectionHits = { windows: 0, caughtTops: 0, caughtBottoms: 0 };
  const fromHighs: TurnDirectionHits = { windows: 0, caughtTops: 0, caughtBottoms: 0 };
  for (const s of series) {
    const kinds = s.anchorKinds?.[family];
    if (!kinds || !s.turnKinds) continue;
    const of = (k: "top" | "bottom") => s.turns.filter((_, j) => s.turnKinds![j] === k).map((i) => s.sessions[i]).sort((a, b) => a - b);
    const tops = of("top");
    const bottoms = of("bottom");
    s.windows[family].forEach((w, j) => {
      const into = kinds[j] === "low" ? fromLows : fromHighs;
      into.windows++;
      if (caught(tops, w)) into.caughtTops++;
      if (caught(bottoms, w)) into.caughtBottoms++;
    });
  }
  return { fromLows, fromHighs };
}
