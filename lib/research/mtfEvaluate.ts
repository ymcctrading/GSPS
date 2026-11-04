/**
 * MTF-R0.1 evaluation: independent outcome labels, component arms, null
 * controls and the confirmation-trade comparison, every rule fixed in
 * docs/research/mtf-r0-1/PREREGISTRATION.md before the first market run.
 * Research only; nothing on the verdict, scan, plan or order path imports it.
 *
 * Outcome labels (defined without reference to any forecast):
 * - A session is a top when its close is the highest of the centred 41
 *   sessions (20 before, 20 after), a bottom when the lowest; an equal close
 *   earlier in the span takes the label (earliest tie). The label becomes
 *   known on the 20th session after it, stored as `confirmedAt`; until then it
 *   is unresolved, never a miss or a hit.
 * - A window's sessions are the real sessions in its nominal calendar span
 *   (no widening). No session: no forecast opportunity, not scored.
 * - Direction hit: a session in the window labelled the expected type.
 *   Timing hit: a session labelled either. They are reported separately; a
 *   wrong-type extreme never counts as a direction hit.
 *
 * Arms, each run through the whole engine, overlap logic and dedup:
 * - "r01": R0.1 itself (intersection, 20% budget).
 * - "swing_only" and "calendar_only": the components, same budget (the
 *   package's rule); and both again without the budget, descriptive only.
 * Windows are deduplicated across weekly issues by (start, end, expected
 *   type): the first issue that published a window is the one counted.
 *
 * Nulls (all preserve episode dependence and spacing):
 * - N2, matched windows: the outcome labels are rotated circularly by a
 *   seeded random offset (at least 41 sessions) over the evaluated span, the
 *   windows held fixed, so unique session coverage, width and direction are
 *   kept exactly. Primary.
 * - N1, calendar phase: every major anchor moved together by k months, k in
 *   +-1..+-60 except multiples of 12 (110 shifts, exhaustive), the whole
 *   generator rerun. Asks whether the calendar component adds anything given
 *   the duration component.
 * - N3, duration phase: the reaction anchor moved by d days, d in
 *   +-1..+-10 (20 shifts, exhaustive), generator rerun. Descriptive.
 *
 * Confirmation trades (the package's third question): after a top-watch
 * window ends, sell short at the next open after the first close below the
 * prior three sessions' lowest close, within five sessions, else cancel;
 * after a bottom watch, the mirror long. Exit at the next open after a close
 * beyond the window's adverse closing extreme, or after 20 sessions; one
 * position at a time; 0.05% a side. The control is the same confirmation at
 * every session of the span without timing. Close-only data enters and exits
 * at the close instead of the next open. Same rule as Rule D in
 * `timeProcedures.ts`, so results compare.
 */
import { seeded } from "@/lib/research/preregisteredTimeTests";
import { R01_RULE, dayNumber, runR01, type ExpectedType, type R01Output, type R01Rule } from "@/lib/research/mtfCandidate";
import { buildInput, prepare, type AdapterShift, type PinnedSeries, type Prepared } from "@/lib/research/mtfAdapter";

export const OUTCOME_SIDE = 20;
export const COST = 0.0005;
export const N2_DRAWS = 2_000;
export const N1_SHIFTS = Array.from({ length: 120 }, (_, i) => (i < 60 ? i - 60 : i - 59)).filter((k) => k % 12 !== 0);
export const N3_SHIFTS = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type Label = "top" | "bottom" | null;

/** 41-session closing extremes, earliest tie; `undefined` where the span is incomplete. */
export function extremeLabels(close: number[]): (Label | undefined)[] {
  const n = close.length;
  const out: (Label | undefined)[] = new Array(n).fill(undefined);
  for (let k = OUTCOME_SIDE; k + OUTCOME_SIDE < n; k++) {
    let top = true;
    let bottom = true;
    for (let j = k - OUTCOME_SIDE; j <= k + OUTCOME_SIDE && (top || bottom); j++) {
      if (j === k) continue;
      if (j < k ? close[j] >= close[k] : close[j] > close[k]) top = false;
      if (j < k ? close[j] <= close[k] : close[j] < close[k]) bottom = false;
    }
    out[k] = top ? "top" : bottom ? "bottom" : null;
  }
  return out;
}

export interface ScoredWindow {
  issued: string;
  start: string;
  end: string;
  expectedType: ExpectedType;
  /** Session indices inside the nominal span. */
  sessions: number[];
  sources: string[];
}

/** Weekly issue sessions: the last session of each Monday-based week, between two dates. */
export function weeklyIssues(dates: string[], from: string, to: string): number[] {
  const week = (iso: string) => Math.floor((dayNumber(iso) + 3) / 7);
  const out: number[] = [];
  for (let e = 0; e < dates.length; e++) {
    if (dates[e] < from || dates[e] > to) continue;
    if (e + 1 >= dates.length || week(dates[e + 1]) !== week(dates[e])) out.push(e);
  }
  return out;
}

/**
 * The data's own sessions as the calendar for past spans: a month is closed on
 * its last recorded session. Callers past the data's end use
 * `lib/market/calendar.ts` instead (the forward issuer does).
 */
export const dataMonthEnd = (dates: string[]) => (e: number) => e + 1 < dates.length && dates[e + 1].slice(0, 7) !== dates[e].slice(0, 7);

function sessionsIn(dates: string[], start: string, end: string): number[] {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < start) lo = mid + 1;
    else hi = mid;
  }
  const out: number[] = [];
  for (let i = lo; i < dates.length && dates[i] <= end; i++) out.push(i);
  return out;
}

export interface ArmRun {
  issues: number;
  status: Record<R01Output["status"], number>;
  windows: ScoredWindow[];
  /** Windows that ran past the data (unresolved, kept out of the counts). */
  pastData: number;
}

/** Runs one arm over the issue sessions and deduplicates windows by (start, end, type). */
export function runArm(p: Prepared, issues: number[], rule: R01Rule, shift: AdapterShift = {}): ArmRun {
  const dates = p.series.bars.map((b) => b.t);
  const monthEnd = dataMonthEnd(dates);
  const status: ArmRun["status"] = { issued: 0, no_forecast: 0, abstained_coverage: 0, rejected_input: 0 };
  const seen = new Set<string>();
  const windows: ScoredWindow[] = [];
  let pastData = 0;
  for (const e of issues) {
    const out = runR01(buildInput(p, e, monthEnd, shift), rule);
    status[out.status]++;
    for (const w of out.windows) {
      const key = `${w.start}|${w.end}|${out.expectedType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (w.end > dates.at(-1)!) {
        pastData++;
        continue;
      }
      windows.push({ issued: out.issueSession, start: w.start, end: w.end, expectedType: out.expectedType, sessions: sessionsIn(dates, w.start, w.end), sources: w.sources });
    }
  }
  return { issues: issues.length, status, windows, pastData };
}

export interface Tally {
  windows: number;
  noSession: number;
  unresolved: number;
  directionHits: number;
  timingHits: number;
  uniqueSessions: number;
  directionRate: number;
}

/** Scores windows against labels; `labelAt` lets the N2 null rotate them. */
export function tally(ws: ScoredWindow[], labelAt: (i: number) => Label | undefined): Tally {
  let windows = 0;
  let noSession = 0;
  let unresolved = 0;
  let directionHits = 0;
  let timingHits = 0;
  const unique = new Set<number>();
  for (const w of ws) {
    if (!w.sessions.length) {
      noSession++;
      continue;
    }
    const labels = w.sessions.map(labelAt);
    const want = w.expectedType === "top_watch" ? "top" : w.expectedType === "bottom_watch" ? "bottom" : null;
    const dir = want ? labels.includes(want) : labels.includes("top") || labels.includes("bottom");
    const timing = labels.includes("top") || labels.includes("bottom");
    if (!dir && labels.includes(undefined)) {
      unresolved++;
      continue;
    }
    windows++;
    w.sessions.forEach((s) => unique.add(s));
    if (dir) directionHits++;
    if (timing) timingHits++;
  }
  return { windows, noSession, unresolved, directionHits, timingHits, uniqueSessions: unique.size, directionRate: windows ? directionHits / windows : 0 };
}

/** N2: circular rotation of the labels over [from, to] sessions, windows fixed. */
export function n2(ws: ScoredWindow[], labels: (Label | undefined)[], from: number, to: number, seed: number, draws = N2_DRAWS) {
  const observed = tally(ws, (i) => labels[i]);
  const span = to - from + 1;
  const rnd = seeded(seed);
  let ge = 0;
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    const off = 2 * OUTCOME_SIDE + 1 + Math.floor(rnd() * (span - 2 * (2 * OUTCOME_SIDE + 1)));
    const t = tally(ws, (i) => (i < from || i > to ? labels[i] : labels[from + ((i - from + off) % span)]));
    sum += t.directionHits;
    if (t.directionHits >= observed.directionHits) ge++;
  }
  return { observed, expectedHits: sum / draws, p: (ge + 1) / (draws + 1), draws };
}

export interface Trade {
  side: 1 | -1;
  entry: number;
  exit: number;
  net: number;
}

const breakout = (c: number[], k: number, side: 1 | -1) =>
  k >= 3 && (side === 1 ? c[k] > Math.max(c[k - 1], c[k - 2], c[k - 3]) : c[k] < Math.min(c[k - 1], c[k - 2], c[k - 3]));

function trade(open: number[], close: number[], k: number, side: 1 | -1, adverse: number, closeOnly: boolean): Trade | null {
  const px = closeOnly ? close : open;
  const entry = closeOnly ? k : k + 1;
  if (entry >= close.length) return null;
  let exit = -1;
  for (let j = closeOnly ? k + 1 : entry; j < close.length && j < entry + 20; j++) {
    if (side === 1 ? close[j] < adverse : close[j] > adverse) {
      exit = closeOnly ? j : j + 1;
      break;
    }
  }
  if (exit === -1) exit = entry + 20;
  if (exit >= px.length) return null;
  const gross = side === 1 ? px[exit] / px[entry] - 1 : 1 - px[exit] / px[entry];
  return { side, entry, exit, net: gross - 2 * COST };
}

export function windowTrades(p: Prepared, ws: ScoredWindow[], closeOnly: boolean): Trade[] {
  const open = p.series.bars.map((b) => b.o);
  const close = p.series.bars.map((b) => b.c);
  const out: Trade[] = [];
  let busy = -1;
  const typed = ws.filter((w) => w.sessions.length && w.expectedType !== "unspecified").sort((a, b) => a.sessions.at(-1)! - b.sessions.at(-1)!);
  for (const w of typed) {
    const side: 1 | -1 = w.expectedType === "bottom_watch" ? 1 : -1;
    const closes = w.sessions.map((i) => close[i]);
    const adverse = side === 1 ? Math.min(...closes) : Math.max(...closes);
    const to = w.sessions.at(-1)!;
    for (let k = to + 1; k <= to + 5 && k < close.length; k++) {
      if (!breakout(close, k, side)) continue;
      if (k + 1 > busy) {
        const t = trade(open, close, k, side, adverse, closeOnly);
        if (t) {
          out.push(t);
          busy = t.exit;
        }
      }
      break;
    }
  }
  return out;
}

export function controlTrades(p: Prepared, from: number, to: number, closeOnly: boolean): Trade[] {
  const open = p.series.bars.map((b) => b.o);
  const close = p.series.bars.map((b) => b.c);
  const out: Trade[] = [];
  let busy = -1;
  for (let k = Math.max(from, 3); k <= to; k++) {
    if (k + 1 <= busy) continue;
    for (const side of [1, -1] as const) {
      if (!breakout(close, k, side)) continue;
      const prior = [close[k - 1], close[k - 2], close[k - 3]];
      const t = trade(open, close, k, side, side === 1 ? Math.min(...prior) : Math.max(...prior), closeOnly);
      if (t) {
        out.push(t);
        busy = t.exit;
      }
      break;
    }
  }
  return out;
}

const mean = (xs: Trade[]) => (xs.length ? xs.reduce((a, x) => a + x.net, 0) / xs.length : 0);

/** Timed trades against random draws of as many control trades, same long/short mix. */
export function tradeTest(t: Trade[], c: Trade[], seed: number, draws = 20_000) {
  const longs = c.filter((x) => x.side === 1);
  const shorts = c.filter((x) => x.side === -1);
  const nL = t.filter((x) => x.side === 1).length;
  const nS = t.length - nL;
  const obs = mean(t);
  const rnd = seeded(seed);
  let ge = 0;
  if (t.length && (nL === 0 || longs.length) && (nS === 0 || shorts.length)) {
    for (let i = 0; i < draws; i++) {
      let s = 0;
      for (let j = 0; j < nL; j++) s += longs[Math.floor(rnd() * longs.length)].net;
      for (let j = 0; j < nS; j++) s += shorts[Math.floor(rnd() * shorts.length)].net;
      if (s / t.length >= obs) ge++;
    }
  } else ge = draws;
  return { trades: t.length, longs: nL, shorts: nS, mean: obs, controlTrades: c.length, controlMean: mean(c), p: (ge + 1) / (draws + 1) };
}

/** Rank p of the observed rate among exhaustive shifts (one-sided, observed counted). */
function shiftRank(observed: number, shifted: number[]) {
  return { observed, shifts: shifted.length, meanShifted: shifted.reduce((a, b) => a + b, 0) / (shifted.length || 1), p: (1 + shifted.filter((x) => x >= observed).length) / (shifted.length + 1) };
}

export interface SeriesRunOptions {
  from: string;
  to: string;
  closeOnly: boolean;
  seed: number;
  n1?: boolean;
  n3?: boolean;
}

/** The whole preregistered evaluation for one series. */
export function evaluateSeries(series: PinnedSeries, o: SeriesRunOptions) {
  const p = prepare(series);
  const dates = series.bars.map((b) => b.t);
  const issues = weeklyIssues(dates, o.from, o.to);
  const labels = extremeLabels(series.bars.map((b) => b.c));
  const lab = (i: number) => labels[i];
  const first = issues[0];
  const last = Math.min(dates.length - 1, issues.at(-1)! + 70);
  const arms: Record<string, R01Rule> = {
    r01: R01_RULE,
    swing_only: { flag: "swing_only", budget: true },
    calendar_only: { flag: "calendar_only", budget: true },
    r01_no_budget: { flag: "intersection", budget: false },
    swing_only_no_budget: { flag: "swing_only", budget: false },
    calendar_only_no_budget: { flag: "calendar_only", budget: false },
  };
  const runs = Object.fromEntries(Object.entries(arms).map(([k, r]) => [k, runArm(p, issues, r)]));
  const summary = Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { status: r.status, pastData: r.pastData, tally: tally(r.windows, lab) }]));
  const n2r = Object.fromEntries(["r01", "swing_only", "calendar_only"].map((k) => [k, n2(runs[k].windows, labels, first, last, o.seed)]));
  const baseRate = (() => {
    let top = 0;
    let bottom = 0;
    let n = 0;
    for (let i = first; i <= last; i++) {
      if (labels[i] === undefined) continue;
      n++;
      if (labels[i] === "top") top++;
      if (labels[i] === "bottom") bottom++;
    }
    return { sessions: n, top: top / (n || 1), bottom: bottom / (n || 1) };
  })();
  const n1 = o.n1 ? shiftRank(summary.r01.tally.directionRate - summary.swing_only.tally.directionRate, N1_SHIFTS.map((k) => tally(runArm(p, issues, R01_RULE, { majorMonths: k }).windows, lab).directionRate - summary.swing_only.tally.directionRate)) : null;
  const n3 = o.n3 ? shiftRank(summary.r01.tally.directionRate, N3_SHIFTS.map((d) => tally(runArm(p, issues, R01_RULE, { reactionDays: d }).windows, lab).directionRate)) : null;
  const trades = tradeTest(windowTrades(p, runs.r01.windows, o.closeOnly), controlTrades(p, first, last, o.closeOnly), o.seed);
  return {
    symbol: series.symbol,
    snapshot: series.snapshotHash,
    source: series.source,
    span: { firstIssue: dates[first], lastIssue: dates[issues.at(-1)!], issues: issues.length, majorAnchors: p.majors.length },
    baseRate,
    arms: summary,
    n2: n2r,
    n1,
    n3,
    trades,
    windows: runs.r01.windows.map((w) => ({ issued: w.issued, start: w.start, end: w.end, expectedType: w.expectedType, sessions: w.sessions.length, labels: w.sessions.map((i) => labels[i] ?? "unresolved"), sources: w.sources })),
  };
}
