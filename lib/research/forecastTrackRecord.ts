/**
 * The measured record behind a dated forecast (AGENTS.md "Forward-looking
 * claims": a dated window may be shown only with its source, its method and
 * its measured record). Research only: nothing on the verdict path imports
 * this module, and nothing here reaches a member.
 *
 * Two records are kept, both scored against a base rate fixed before the data
 * was read (Dewey's recurrent-event statistic, W040 p.4, CYC-24: a hit rate
 * means nothing until it is set beside the rate chance gives the same window):
 *
 * 1. The method's own published forecasts (`publishedForecasts.ts`) against
 *    the Dow record the same author tabled in 1949 (`dowSwingRecord.json`,
 *    W009 Ch. VII). Two turn sets, both his: the 9-point swings (his
 *    "important" moves, p.75) and the 3-day turns.
 *    - A call hits when a turn of its kind (or either kind for "turn") falls
 *      inside its window.
 *    - Its base rate is the share of every same-length window starting in the
 *      same calendar year that would also have held such a turn.
 *    - p is the chance of at least the observed hits if each call hit at its
 *      own base rate (Poisson-binomial upper tail).
 *
 * 2. The macro cycle (`lib/gann/macroCycle.ts`, Master Course A2.1 Ch. 7
 *    anchors) against the monthly market record since 1871
 *    (`marketHistory.json`, Shiller's S&P composite, a stand-in for the Dow).
 *    - A month is a major high (low) when it is the highest (lowest) of the 25
 *      months centred on it, so a turn that held a year either side.
 *    - A window hits when a turn of its kind falls within two months of its
 *      anniversary month.
 *    - The base rate is the share of all months in the same span with such a
 *      turn within two months, by kind.
 *    - In sample: windows before 1936, since the anchors come from a chapter
 *      that walks the market to 1935. Out of sample: 1936 on.
 *    The 12-month and 2-month spans are engineering choices, fixed here before
 *    any window was scored and not tuned afterwards.
 *
 * Three-question basis:
 * 1. Source: the forecasts and the swing tables are the method's own (class
 *    A); the macro anchors are A2.1 Ch. 7. The scoring rule is Dewey's.
 * 2. Cycles: Dewey's checklist asks for repetition, out-of-sample persistence
 *    and a significance test; this module supplies the last two for the macro
 *    cycle and the first published record for the annual forecasts. Tomes'
 *    point that a forecast's record decides its worth (CYC-47) is the reason
 *    it exists.
 * 3. Hermetic: Cause and Effect. A forecast is a stated cause; only the dated
 *    effect, scored after it, says whether the cause was real.
 */
import history from "@/lib/gann/marketHistory.json";
import { MACRO_CYCLE_ANCHORS, windowFor, type MacroCycleWindow } from "@/lib/gann/macroCycle";
import type { ForecastWindow } from "@/lib/research/forecastRecord";
import record from "@/lib/research/dowSwingRecord.json";
import { PERMANENT_CHANGE_DATES, PUBLISHED_FORECASTS, SELF_SCORED_CLAIMS, type PublishedForecast } from "@/lib/research/publishedForecasts";

export interface Turn {
  date: string;
  price: number;
  kind: "high" | "low";
}

export type TurnSet = "nine" | "three";

export const DOW_SWINGS: Record<TurnSet, Turn[]> = {
  nine: record.nine as Turn[],
  three: record.three as Turn[],
};

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const matches = (expect: ForecastWindow["expect"], kind: Turn["kind"]) => expect === "turn" || expect === kind;

/** The exchange was shut from 31 Jul to 11 Dec 1914; no window there is scored. */
const CLOSED = { from: t("1914-07-31"), to: t("1914-12-11") };

/** P(X >= k) for a sum of independent Bernoullis with the given rates. */
export function poissonBinomialTail(rates: number[], k: number): number {
  let dist = [1];
  for (const p of rates) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, i) => {
      next[i] += v * (1 - p);
      next[i + 1] += v * p;
    });
    dist = next;
  }
  return Math.min(1, dist.slice(Math.max(0, k)).reduce((a, b) => a + b, 0));
}

/** Each table's turn times, parsed once. */
const TIMES = new Map<Turn[], number[]>();
const timesOf = (turns: Turn[]) => {
  let ts = TIMES.get(turns);
  if (!ts) TIMES.set(turns, (ts = turns.map((x) => t(x.date))));
  return ts;
};

function firstMatch(turns: Turn[], from: number, to: number, expect: ForecastWindow["expect"]): Turn | undefined {
  const ts = timesOf(turns);
  let lo = 0;
  let hi = ts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < ts.length && ts[i] <= to; i++) if (matches(expect, turns[i].kind)) return turns[i];
  return undefined;
}

/** Share of same-length windows starting on each day of the window's calendar year that hold a matching turn. */
export function windowBaseRate(turns: Turn[], w: ForecastWindow): number {
  const len = (t(w.to) - t(w.from)) / DAY;
  const year = Number(w.from.slice(0, 4));
  let n = 0;
  let hits = 0;
  for (let s = Date.UTC(year, 0, 1); s < Date.UTC(year + 1, 0, 1); s += DAY) {
    const e = s + len * DAY;
    if (e >= CLOSED.from && s <= CLOSED.to) continue;
    n++;
    if (firstMatch(turns, s, e, w.expect)) hits++;
  }
  return n > 0 ? hits / n : 0;
}

export interface ScoredCall extends ForecastWindow {
  hit: boolean;
  /** The turn inside the window, when there is one. */
  turn: Turn | null;
  /** Calendar days from the window to the nearest turn of the expected kind; 0 for a hit. */
  daysOff: number | null;
  baseRate: number;
}

export interface CallScore {
  set: TurnSet;
  calls: ScoredCall[];
  hits: number;
  /** Hits expected by chance: the sum of the base rates. */
  expected: number;
  hitRate: number;
  baseMean: number;
  p: number;
}

export function scoreCalls(windows: ForecastWindow[], set: TurnSet): CallScore {
  const turns = DOW_SWINGS[set];
  const calls = windows.map((w): ScoredCall => {
    const from = t(w.from);
    const to = t(w.to);
    const turn = firstMatch(turns, from, to, w.expect) ?? null;
    let daysOff: number | null = turn ? 0 : null;
    if (!turn) {
      for (const x of turns) {
        if (!matches(w.expect, x.kind)) continue;
        const d = Math.round((t(x.date) < from ? from - t(x.date) : t(x.date) - to) / DAY);
        if (daysOff === null || d < daysOff) daysOff = d;
      }
    }
    return { ...w, hit: turn !== null, turn, daysOff, baseRate: windowBaseRate(turns, w) };
  });
  const hits = calls.filter((c) => c.hit).length;
  const rates = calls.map((c) => c.baseRate);
  const expected = rates.reduce((a, b) => a + b, 0);
  return {
    set,
    calls,
    hits,
    expected,
    hitRate: calls.length ? hits / calls.length : 0,
    baseMean: calls.length ? expected / calls.length : 0,
    p: poissonBinomialTail(rates, hits),
  };
}

export interface ForecastYearScore {
  id: string;
  issued: string;
  source: string;
  nine: CallScore;
  three: CallScore;
}

export function scorePublishedForecasts(forecasts: PublishedForecast[] = PUBLISHED_FORECASTS): ForecastYearScore[] {
  return forecasts.map((f) => ({
    id: f.id,
    issued: f.issued,
    source: f.source,
    nine: scoreCalls(f.windows, "nine"),
    three: scoreCalls(f.windows, "three"),
  }));
}

/** Every published call pooled: one hit rate, one base rate, one p per turn set. */
export function pooledForecastScore(set: TurnSet, forecasts: PublishedForecast[] = PUBLISHED_FORECASTS): CallScore {
  return scoreCalls(forecasts.flatMap((f) => f.windows), set);
}

/** The permanent change dates as turn windows in each year the Dow record covers. */
export function permanentDateWindows(fromYear: number, toYear: number, set: TurnSet): ForecastWindow[] {
  const turns = DOW_SWINGS[set];
  const last = t(turns[turns.length - 1].date);
  const first = t(turns[0].date);
  const out: ForecastWindow[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (const d of PERMANENT_CHANGE_DATES) {
      const from = Date.UTC(y, d.from[0] - 1, d.from[1]);
      const to = Date.UTC(y, d.to[0] - 1, d.to[1]);
      if (from <= first || to >= last) continue;
      if (to >= CLOSED.from && from <= CLOSED.to) continue;
      out.push({ label: `${y} ${d.label}`, from: iso(from), to: iso(to), expect: "turn" });
    }
  }
  return out;
}

export interface ClaimCheck {
  claim: string;
  source: string;
  claimedDate: string;
  /** The nearest turn of the claimed kind in each table, and its distance in calendar days. */
  nine: { date: string; price: number; days: number } | null;
  three: { date: string; price: number; days: number } | null;
}

function nearest(turns: Turn[], date: string, kind: Turn["kind"]) {
  let best: { date: string; price: number; days: number } | null = null;
  for (const x of turns) {
    if (x.kind !== kind) continue;
    const days = Math.round((t(x.date) - t(date)) / DAY);
    if (!best || Math.abs(days) < Math.abs(best.days)) best = { date: x.date, price: x.price, days };
  }
  return best;
}

export function checkSelfScoredClaims(): ClaimCheck[] {
  return SELF_SCORED_CLAIMS.map((c) => ({
    ...c,
    nine: nearest(DOW_SWINGS.nine, c.claimedDate, c.kind),
    three: nearest(DOW_SWINGS.three, c.claimedDate, c.kind),
  }));
}

// ---------------------------------------------------------------------------
// The macro cycle against the monthly record.

/** Months either side a turn must hold to count as major. */
export const MACRO_TURN_SPAN = 12;
/** Months either side of the anniversary month a turn may fall and still hit. */
export const MACRO_HIT_TOLERANCE = 2;
/** The anchors come from a chapter that walks the market to 1935; windows from here on are out of sample. */
export const MACRO_OUT_OF_SAMPLE_FROM = 1936;

const [startYear, startMonth] = history.start.split("-").map(Number);
const series = history.stocks as number[];
const monthIndex = (year: number, month1: number) => (year - startYear) * 12 + (month1 - startMonth);
const monthLabel = (i: number) => {
  const n = startYear * 12 + (startMonth - 1) + i;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};

/** Major turns on the monthly record: the extreme of the 25 months centred on it. Only months with the whole span on record. */
export function monthlyTurns(span = MACRO_TURN_SPAN): { index: number; month: string; kind: "high" | "low" }[] {
  const out: { index: number; month: string; kind: "high" | "low" }[] = [];
  for (let i = span; i + span < series.length; i++) {
    const around = series.slice(i - span, i + span + 1);
    if (series[i] === Math.max(...around)) out.push({ index: i, month: monthLabel(i), kind: "high" });
    else if (series[i] === Math.min(...around)) out.push({ index: i, month: monthLabel(i), kind: "low" });
  }
  return out;
}

export interface MacroWindowScore extends MacroCycleWindow {
  kind: "high" | "low";
  hit: boolean;
  /** The turn month that hit, when there is one. */
  turn: string | null;
}

export interface MacroSpanScore {
  label: string;
  windows: MacroWindowScore[];
  hits: number;
  expected: number;
  hitRate: number;
  baseMean: number;
  p: number;
  /** Base rate by kind over the span: share of months with a turn of that kind within the tolerance. */
  baseRate: { high: number; low: number };
}

/** Every anchor's major windows, year by year, whose turn could be confirmed on the record. */
export function macroWindowsOnRecord(minLengths = 1): MacroCycleWindow[] {
  const lastScorable = series.length - 1 - MACRO_TURN_SPAN - MACRO_HIT_TOLERANCE;
  const out: MacroCycleWindow[] = [];
  for (let y = MACRO_CYCLE_ANCHORS[0].year + 1; ; y++) {
    if (monthIndex(y, 1) > lastScorable) break;
    for (const a of MACRO_CYCLE_ANCHORS) {
      const w = windowFor(a, y);
      if (!w || w.majorCycleYears.length < minLengths) continue;
      if (monthIndex(y, a.month + 1) > lastScorable) continue;
      out.push(w);
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

function scoreMacroSpan(label: string, windows: MacroCycleWindow[], fromIdx: number, toIdx: number): MacroSpanScore {
  const turns = monthlyTurns();
  const near = (i: number, kind: "high" | "low") =>
    turns.find((x) => x.kind === kind && Math.abs(x.index - i) <= MACRO_HIT_TOLERANCE);
  const base = (kind: "high" | "low") => {
    let n = 0;
    let h = 0;
    for (let i = fromIdx; i <= toIdx; i++) {
      n++;
      if (near(i, kind)) h++;
    }
    return n ? h / n : 0;
  };
  const baseRate = { high: base("high"), low: base("low") };
  const scored = windows.map((w): MacroWindowScore => {
    const [y, m] = w.month.split("-").map(Number);
    const kind = w.bullish ? "low" : "high";
    const turn = near(monthIndex(y, m), kind);
    return { ...w, kind, hit: !!turn, turn: turn?.month ?? null };
  });
  const hits = scored.filter((w) => w.hit).length;
  const rates = scored.map((w) => baseRate[w.kind]);
  const expected = rates.reduce((a, b) => a + b, 0);
  return {
    label,
    windows: scored,
    hits,
    expected,
    hitRate: scored.length ? hits / scored.length : 0,
    baseMean: scored.length ? expected / scored.length : 0,
    p: poissonBinomialTail(rates, hits),
    baseRate,
  };
}

/** The macro cycle's record: in sample (before 1936) and out of sample, all major windows and those where four or more lengths converge. */
export function macroCycleRecord(): MacroSpanScore[] {
  const split = monthIndex(MACRO_OUT_OF_SAMPLE_FROM, 1);
  const first = monthIndex(MACRO_CYCLE_ANCHORS[0].year + 1, 1);
  const last = series.length - 1 - MACRO_TURN_SPAN - MACRO_HIT_TOLERANCE;
  const all = macroWindowsOnRecord();
  const idx = (w: MacroCycleWindow) => {
    const [y, m] = w.month.split("-").map(Number);
    return monthIndex(y, m);
  };
  const inS = all.filter((w) => idx(w) < split);
  const outS = all.filter((w) => idx(w) >= split);
  const strong = (ws: MacroCycleWindow[]) => ws.filter((w) => w.majorCycleYears.length >= 4);
  return [
    scoreMacroSpan(`in sample ${monthLabel(first)} to ${monthLabel(split - 1)}`, inS, first, split - 1),
    scoreMacroSpan(`out of sample ${monthLabel(split)} to ${monthLabel(last)}`, outS, split, last),
    scoreMacroSpan(`in sample, four or more lengths`, strong(inS), first, split - 1),
    scoreMacroSpan(`out of sample, four or more lengths`, strong(outS), split, last),
  ];
}

/** The macro cycle's major windows projected forward, where at least `minLengths` major lengths converge. */
export function projectMacroWindows(fromYear: number, toYear: number, minLengths = 4): MacroCycleWindow[] {
  const out: MacroCycleWindow[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (const a of MACRO_CYCLE_ANCHORS) {
      const w = windowFor(a, y);
      if (w && w.majorCycleYears.length >= minLengths) out.push(w);
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}
