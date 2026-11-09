/**
 * Four frozen time procedures, each with a kill criterion written before it
 * was scored, so new evidence is allowed to disprove them. Research only:
 * nothing on the verdict path imports this module, and nothing here reaches a
 * member ("Forward-looking claims"; the owner's "Keep it hidden").
 *
 * The owner (2026-10-30): "Do not defend a supposed secret. Define a
 * procedure that new evidence is allowed to disprove." The procedures are
 * Rules A to D from the reconstruction he shared the same day (an outside
 * model's "Gann mentoring a young Buffett"), frozen here exactly as written.
 * They are modern research specifications, not the author's rules; its own
 * words: "Their numerical settings are declared design choices."
 *
 * Common definitions (as written):
 * - Daily closes. A confirmed high pivot is the highest close in a centred
 *   21-session window, a low the lowest; it is eligible only once the tenth
 *   following session has closed. Ties go to the earliest session.
 * - At each month-end, only information then available; the next month's
 *   forecasts are frozen then.
 * - A window is three sessions centred on the first session on or after the
 *   projected calendar date.
 * - A top window succeeds when it holds a close that is the highest of its
 *   centred 41 sessions; a bottom, the lowest. Later closes define outcomes,
 *   never signals.
 * - Overlapping windows of one direction merge; opposite-direction overlaps
 *   are kept as conflicts and never traded.
 * - Rule A: every eligible pivot of the last ten calendar years, its first
 *   and second calendar anniversaries falling next month, kept only when the
 *   month-end close is within 2% of the 252-session highest close (tops) or
 *   lowest (bottoms). A0 is the same without the price filter (its
 *   "anniversaries alone" comparison), counted as a variant.
 * - Rule B: the latest eligible pivot, close a; unit s, the median absolute
 *   daily close change over the 252 sessions before it; n = |P - a| / s at
 *   the month-end close P; the date n calendar days after the pivot (halves
 *   up), if it falls next month; a top when P > a, a bottom when P < a.
 * - Rule C: the latest eligible pivot; geocentric tropical Mars at 12:00 UTC
 *   on its date; every exact opposition to that longitude next month
 *   (retrograde crossings included); Rule A's price filter decides the
 *   direction, and nothing is issued when both or neither pass.
 * - Rule D: after a bottom window ends, buy at the next open after the first
 *   close above the prior three sessions' highest close; after a top, sell
 *   short on the mirror; confirmation within five sessions or cancel; exit at
 *   the next open after the first close beyond the window's adverse closing
 *   extreme, or after 20 holding sessions; one position at a time.
 *
 * This module's own choices, fixed before scoring:
 * - Data: SPY and DIA daily opens and closes from Alpaca (split-adjusted,
 *   SIP, `modernDailyBars.json`). The rules name the Dow 1913-1948; no daily
 *   Dow closes for those years are in the repo or reachable from here (the
 *   swing tables hold turns only), so that span waits on a data source. DIA
 *   stands for the Dow and is the primary outcome; SPY is secondary (the two
 *   move together, so they are not two independent tests).
 * - Held-out span: forecasts issued at the month-ends of Dec 2016 to Nov 2025
 *   (forecasting Jan 2017 to Dec 2025). The first year is lost to the
 *   252-session look-back. No rule here was developed on these years.
 * - Null (the matched-frequency control): each issued window is moved to a
 *   random calendar day of the same month, keeping its direction, and the
 *   same merging applied; 20,000 seeded draws. This is "price location
 *   alone" for A and C (the same months and directions, no date) and the
 *   "elapsed-time control with the same forecast frequency" for B.
 * - Rule D's control: "the identical confirmation strategy without timing
 *   windows": every close above (below) the prior three sessions' highest
 *   (lowest) close, entered at the next open, the adverse extreme taken from
 *   those three sessions, the same exits, one position at a time. p: the
 *   chance a random draw of as many control trades, same mix of long and
 *   short, has as high a mean. Costs 0.05% a side, an engineering choice.
 * - Family: 4 turn rules (A, A0, B, C) × 2 symbols + Rule D on A, B and C ×
 *   2 symbols = 14 tests, so the cut-off is 0.05 / 14 ≈ 0.0036.
 *
 * Kill criteria, written before the first run:
 * - A turn rule is refuted on the held-out span unless DIA's hits beat the
 *   null at p < 0.0036 and SPY's hits are above the null's mean. With fewer
 *   than 10 DIA windows it is "not testable", never "surviving".
 * - Rule D is refuted unless its mean net return per trade on DIA beats the
 *   control at p < 0.0036.
 * - Forward: from the Oct 2026 month-end, each month's windows are appended
 *   to `timeProcedureLog.json` before the month opens, never edited. At the
 *   24-month review (Oct 2028) a rule that survived the held-out span is
 *   refuted if its forward DIA windows do not beat the null at p < 0.05. A
 *   rule refuted on the held-out span stays refuted; its log continues for
 *   the record only.
 *
 * Three-question basis:
 * 1. Source: the author's "correct base or starting point" and nested cycles
 *    (Tunnel Thru the Air, ch. VII), anniversaries of tops and bottoms, the
 *    balance of time and price, and a Mars count from a pivot (the 1954
 *    coffee letter); the rules' numbers are the reconstruction's choices.
 * 2. Cycles: Dewey's out-of-sample persistence on untouched data, and his
 *    rule fixed before testing.
 * 3. Hermetic: Cause and Effect, a stated cause held to its effect.
 */
import { planetLongitudes } from "@/lib/gann/planetaryAverages";
import { seeded } from "@/lib/research/preregisteredTimeTests";
import barsJson from "@/lib/research/modernDailyBars.json";

export const PROCEDURE_RULES = ["A", "A0", "B", "C"] as const;
export type ProcedureRule = (typeof PROCEDURE_RULES)[number];
export const TRADED_RULES = ["A", "B", "C"] as const;
export const PROCEDURE_SYMBOLS = ["DIA", "SPY"] as const;
export type ProcedureSymbol = (typeof PROCEDURE_SYMBOLS)[number];
export const PROCEDURE_TESTS = PROCEDURE_RULES.length * PROCEDURE_SYMBOLS.length + TRADED_RULES.length * PROCEDURE_SYMBOLS.length;
export const PROCEDURE_CUTOFF = 0.05 / PROCEDURE_TESTS;
export const HELD_OUT = { firstIssue: "2016-12", lastIssue: "2025-11" } as const;
export const MIN_WINDOWS = 10;
export const NULL_DRAWS = 20_000;
export const COST = 0.0005;

const PIVOT_SIDE = 10;
const OUTCOME_SIDE = 20;
const LOOKBACK = 252;
const NEAR = 0.02;
const DAY = 86_400_000;

export interface Series {
  dates: string[];
  open: number[];
  close: number[];
}

const BARS = (barsJson as unknown as { symbols: Record<ProcedureSymbol, [string, number, number][]> }).symbols;
export function seriesFor(symbol: ProcedureSymbol): Series {
  const rows = BARS[symbol];
  return { dates: rows.map((r) => r[0]), open: rows.map((r) => r[1]), close: rows.map((r) => r[2]) };
}

export interface Pivot {
  index: number;
  date: string;
  close: number;
  kind: "top" | "bottom";
}

/** Confirmed pivots: the highest (lowest) close of the centred 21 sessions, ties to the earliest. */
export function confirmedPivots(s: Series): Pivot[] {
  const out: Pivot[] = [];
  const c = s.close;
  for (let i = PIVOT_SIDE; i + PIVOT_SIDE < c.length; i++) {
    let top = true;
    let bottom = true;
    for (let j = i - PIVOT_SIDE; j <= i + PIVOT_SIDE && (top || bottom); j++) {
      if (j === i) continue;
      // An equal close earlier in the window takes the pivot; an equal close later does not.
      if (j < i ? c[j] >= c[i] : c[j] > c[i]) top = false;
      if (j < i ? c[j] <= c[i] : c[j] < c[i]) bottom = false;
    }
    if (top) out.push({ index: i, date: s.dates[i], close: c[i], kind: "top" });
    if (bottom) out.push({ index: i, date: s.dates[i], close: c[i], kind: "bottom" });
  }
  return out;
}

const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const iso = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const monthOf = (isoDate: string) => isoDate.slice(0, 7);
const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Index of the last session of each calendar month, keyed by month. */
export function monthEnds(s: Series): Map<string, number> {
  const out = new Map<string, number>();
  s.dates.forEach((d, i) => out.set(monthOf(d), i));
  return out;
}

export interface Window {
  /** The projected calendar date (the first one, after merging). */
  projected: string;
  from: number;
  to: number;
  direction: "top" | "bottom";
}

/** The same calendar date `n` years on; 29 Feb maps to 28 Feb in a non-leap year (the rule as written). */
export function anniversary(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const leap = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const day = m === 2 && d === 29 && !leap(y + n) ? 28 : d;
  return `${y + n}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first session on or after a calendar date, or -1 past the data. */
function sessionOnOrAfter(s: Series, date: string): number {
  let lo = 0;
  let hi = s.dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo < s.dates.length ? lo : -1;
}

/** A three-session window centred on the first session on or after `date`; null past the data. */
function windowAt(s: Series, date: string, direction: Window["direction"]): Window | null {
  const k = sessionOnOrAfter(s, date);
  if (k < 1) return null;
  return { projected: date, from: k - 1, to: Math.min(k + 1, s.dates.length - 1), direction };
}

/** Merges overlapping windows of one direction; opposite-direction overlaps stay as they are. */
export function mergeWindows(ws: Window[]): Window[] {
  const out: Window[] = [];
  for (const dir of ["top", "bottom"] as const) {
    const sorted = ws.filter((w) => w.direction === dir).sort((a, b) => a.from - b.from);
    for (const w of sorted) {
      const last = out.at(-1);
      if (last && last.direction === dir && w.from <= last.to) last.to = Math.max(last.to, w.to);
      else out.push({ ...w });
    }
  }
  return out.sort((a, b) => a.from - b.from || (a.direction < b.direction ? -1 : 1));
}

/** True when a window overlaps one of the other direction. */
export function inConflict(w: Window, all: Window[]): boolean {
  return all.some((o) => o.direction !== w.direction && o.from <= w.to && w.from <= o.to);
}

const marsCache = new Map<number, number>();
const marsOn = (d: number) => {
  let v = marsCache.get(d);
  if (v === undefined) {
    v = planetLongitudes(new Date(d * DAY)).geo.Mars;
    marsCache.set(d, v);
  }
  return v;
};
/** Signed difference a - b on the circle, in (-180, 180]. */
const diff = (a: number, b: number) => {
  const x = (((a - b) % 360) + 360) % 360;
  return x > 180 ? x - 360 : x;
};

/** The calendar dates in month `ym` on which geocentric Mars passes `target` degrees (noon to noon, nearer noon). */
export function marsCrossings(target: number, ym: string): string[] {
  const start = dayNo(`${ym}-01`);
  const out: string[] = [];
  for (let d = start - 1; d < start + daysInMonth(ym); d++) {
    const a = diff(marsOn(d), target);
    const b = diff(marsOn(d + 1), target);
    // A sign change across a small step is a crossing; a jump across ±180 is not.
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
      if (Math.abs(a - b) > 90) continue;
      const day = Math.abs(a) <= Math.abs(b) ? d : d + 1;
      if (day >= start && day < start + daysInMonth(ym) && !out.includes(iso(day))) out.push(iso(day));
    }
  }
  return out;
}

const nearHigh = (s: Series, e: number) => s.close[e] >= (1 - NEAR) * Math.max(...s.close.slice(e - LOOKBACK + 1, e + 1));
const nearLow = (s: Series, e: number) => s.close[e] <= (1 + NEAR) * Math.min(...s.close.slice(e - LOOKBACK + 1, e + 1));

/** The unit of Rule B: the median absolute daily close change over the 252 sessions before the pivot. */
function unitBefore(s: Series, i: number): number | null {
  if (i - LOOKBACK - 1 < 0) return null;
  const ch: number[] = [];
  for (let k = i - LOOKBACK; k < i; k++) ch.push(Math.abs(s.close[k] - s.close[k - 1]));
  ch.sort((a, b) => a - b);
  const m = ch.length / 2;
  return ch.length % 2 ? ch[Math.floor(m)] : (ch[m - 1] + ch[m]) / 2;
}

export interface Projection {
  date: string;
  direction: Window["direction"];
}

/**
 * The dates a rule projects at the month-end session `e` for the next month,
 * using only closes up to `e` (the forward log stores these, before the
 * sessions exist). Empty when the look-back is short.
 */
export function projectionsAt(rule: ProcedureRule, s: Series, e: number, pivots: Pivot[]): Projection[] {
  if (e < LOOKBACK - 1) return [];
  const ym = nextMonth(monthOf(s.dates[e]));
  const known = pivots.filter((p) => p.index + PIVOT_SIDE <= e);
  const out: Projection[] = [];
  const push = (date: string, direction: Window["direction"]) => {
    if (monthOf(date) === ym) out.push({ date, direction });
  };
  if (rule === "A" || rule === "A0") {
    const cutoff = `${Number(s.dates[e].slice(0, 4)) - 10}${s.dates[e].slice(4)}`;
    const high = nearHigh(s, e);
    const low = nearLow(s, e);
    for (const p of known) {
      if (p.date <= cutoff) continue;
      if (rule === "A" && !(p.kind === "top" ? high : low)) continue;
      for (const n of [1, 2]) push(anniversary(p.date, n), p.kind);
    }
  } else if (rule === "B") {
    const p = known.at(-1);
    const unit = p ? unitBefore(s, p.index) : null;
    if (p && unit) {
      const P = s.close[e];
      if (P !== p.close) push(iso(dayNo(p.date) + Math.floor(Math.abs(P - p.close) / unit + 0.5)), P > p.close ? "top" : "bottom");
    }
  } else {
    const p = known.at(-1);
    const high = nearHigh(s, e);
    const low = nearLow(s, e);
    if (p && high !== low) {
      const target = (marsOn(dayNo(p.date)) + 180) % 360;
      for (const d of marsCrossings(target, ym)) push(d, high ? "top" : "bottom");
    }
  }
  return out;
}

/**
 * Only windows that open after the issue session `e`: a projection on the next
 * month's first session would otherwise centre a window whose first session is
 * the issue day itself, already closed when the forecast is made.
 */
const prospective = (e: number) => (w: Window | null): w is Window => w !== null && w.from > e;

/** The windows a rule issues at the month-end session `e` for the next month, merged. */
export function issueAt(rule: ProcedureRule, s: Series, e: number, pivots: Pivot[]): Window[] {
  return mergeWindows(projectionsAt(rule, s, e, pivots).map((p) => windowAt(s, p.date, p.direction)).filter(prospective(e)));
}

/** Whether a window holds the highest (top) or lowest (bottom) close of its centred 41 sessions; null when the data can't tell yet. */
export function windowHit(s: Series, w: Window): boolean | null {
  if (w.from - OUTCOME_SIDE < 0 || w.to + OUTCOME_SIDE >= s.close.length) return null;
  for (let k = w.from; k <= w.to; k++) {
    const span = s.close.slice(k - OUTCOME_SIDE, k + OUTCOME_SIDE + 1);
    if (s.close[k] === (w.direction === "top" ? Math.max(...span) : Math.min(...span))) return true;
  }
  return false;
}

export interface Issue {
  issued: string;
  month: string;
  windows: Window[];
}

/** Every month's issue from `firstIssue` to `lastIssue` (YYYY-MM of the month-end), in order. */
export function issues(rule: ProcedureRule, symbol: ProcedureSymbol, firstIssue: string = HELD_OUT.firstIssue, lastIssue: string = HELD_OUT.lastIssue): Issue[] {
  const s = seriesFor(symbol);
  const pivots = confirmedPivots(s);
  const out: Issue[] = [];
  for (const [ym, e] of monthEnds(s)) {
    if (ym < firstIssue || ym > lastIssue) continue;
    out.push({ issued: s.dates[e], month: nextMonth(ym), windows: issueAt(rule, s, e, pivots) });
  }
  return out;
}

export interface TurnScore {
  rule: ProcedureRule;
  symbol: ProcedureSymbol;
  windows: number;
  conflicts: number;
  hits: number;
  expected: number;
  p: number;
}

/** Hits against the matched-frequency null: each window moved to a random day of its month whose window opens after the issue session, same direction, same merging. */
export function turnScore(rule: ProcedureRule, symbol: ProcedureSymbol, seed = 20261030, draws = NULL_DRAWS): TurnScore {
  const s = seriesFor(symbol);
  const iss = issues(rule, symbol);
  const scored = iss.flatMap((x) => x.windows.map((w) => ({ w, month: x.month, all: x.windows })));
  const hits = scored.filter(({ w }) => windowHit(s, w)).length;
  const conflicts = scored.filter(({ w, all }) => inConflict(w, all)).length;
  // The null redraws each month's windows: the same count of each direction on random days of that month.
  const plan = iss
    .filter((x) => x.windows.length)
    .map((x) => {
      const e = s.dates.indexOf(x.issued);
      const all = Array.from({ length: daysInMonth(x.month) }, (_, i) => `${x.month}-${String(i + 1).padStart(2, "0")}`);
      return { e, days: all.filter((d) => prospective(e)(windowAt(s, d, "top"))), dirs: x.windows.map((w) => w.direction) };
    });
  const rnd = seeded(seed);
  let ge = 0;
  let sum = 0;
  for (let i = 0; i < draws; i++) {
    let h = 0;
    for (const { e, days, dirs } of plan) {
      // Same count as issued: each window is drawn from the days whose window opens after the issue session.
      const ws = days.length ? dirs.map((d) => windowAt(s, days[Math.floor(rnd() * days.length)], d)).filter(prospective(e)) : [];
      for (const w of mergeWindows(ws)) if (windowHit(s, w)) h++;
    }
    sum += h;
    if (h >= hits) ge++;
  }
  return { rule, symbol, windows: scored.length, conflicts, hits, expected: sum / draws, p: (ge + 1) / (draws + 1) };
}

export interface Trade {
  entry: number;
  exit: number;
  side: 1 | -1;
  /** Net return after costs. */
  net: number;
}

/** Runs one entry from signal session `k` (the confirming close): in at the next open, out by the adverse extreme or 20 sessions. */
function trade(s: Series, k: number, side: 1 | -1, adverse: number): Trade | null {
  const entry = k + 1;
  if (entry >= s.close.length) return null;
  let exitAt = -1;
  for (let j = entry; j < s.close.length && j < entry + 20; j++) {
    if (side === 1 ? s.close[j] < adverse : s.close[j] > adverse) {
      exitAt = j + 1;
      break;
    }
  }
  if (exitAt === -1) exitAt = entry + 20;
  if (exitAt >= s.open.length) return null;
  const gross = side === 1 ? s.open[exitAt] / s.open[entry] - 1 : 1 - s.open[exitAt] / s.open[entry];
  return { entry, exit: exitAt, side, net: gross - 2 * COST };
}

const breakout = (s: Series, k: number, side: 1 | -1) =>
  k >= 3 && (side === 1 ? s.close[k] > Math.max(s.close[k - 1], s.close[k - 2], s.close[k - 3]) : s.close[k] < Math.min(s.close[k - 1], s.close[k - 2], s.close[k - 3]));

/** Rule D on a rule's non-conflicting windows, one position at a time. */
export function overlayTrades(rule: (typeof TRADED_RULES)[number], symbol: ProcedureSymbol): Trade[] {
  const s = seriesFor(symbol);
  const ws = issues(rule, symbol)
    .flatMap((x) => x.windows.filter((w) => !inConflict(w, x.windows)))
    .sort((a, b) => a.to - b.to);
  const out: Trade[] = [];
  let busyUntil = -1;
  for (const w of ws) {
    const side: 1 | -1 = w.direction === "bottom" ? 1 : -1;
    const closes = s.close.slice(w.from, w.to + 1);
    const adverse = side === 1 ? Math.min(...closes) : Math.max(...closes);
    for (let k = w.to + 1; k <= w.to + 5 && k < s.close.length; k++) {
      if (!breakout(s, k, side)) continue;
      if (k + 1 > busyUntil) {
        const t = trade(s, k, side, adverse);
        if (t) {
          out.push(t);
          busyUntil = t.exit;
        }
      }
      break;
    }
  }
  return out;
}

/** The control: every breakout either way over the same span, the three prior sessions as the "window". */
export function controlTrades(symbol: ProcedureSymbol): Trade[] {
  const s = seriesFor(symbol);
  const from = sessionOnOrAfter(s, `${nextMonth(HELD_OUT.firstIssue)}-01`);
  const to = sessionOnOrAfter(s, `${nextMonth(nextMonth(HELD_OUT.lastIssue))}-01`);
  const out: Trade[] = [];
  let busyUntil = -1;
  for (let k = from; k < to; k++) {
    if (k + 1 <= busyUntil) continue;
    for (const side of [1, -1] as const) {
      if (!breakout(s, k, side)) continue;
      const prior = [s.close[k - 1], s.close[k - 2], s.close[k - 3]];
      const t = trade(s, k, side, side === 1 ? Math.min(...prior) : Math.max(...prior));
      if (t) {
        out.push(t);
        busyUntil = t.exit;
      }
      break;
    }
  }
  return out;
}

export interface OverlayScore {
  rule: (typeof TRADED_RULES)[number];
  symbol: ProcedureSymbol;
  trades: number;
  mean: number;
  controlTrades: number;
  controlMean: number;
  p: number;
}

export function overlayScore(rule: (typeof TRADED_RULES)[number], symbol: ProcedureSymbol, seed = 20261030, draws = NULL_DRAWS): OverlayScore {
  const t = overlayTrades(rule, symbol);
  const c = controlTrades(symbol);
  const mean = (xs: Trade[]) => (xs.length ? xs.reduce((a, x) => a + x.net, 0) / xs.length : 0);
  const longs = c.filter((x) => x.side === 1);
  const shorts = c.filter((x) => x.side === -1);
  const nL = t.filter((x) => x.side === 1).length;
  const nS = t.length - nL;
  const obs = mean(t);
  const rnd = seeded(seed);
  let ge = 0;
  if (t.length && (nL === 0 || longs.length) && (nS === 0 || shorts.length)) {
    for (let i = 0; i < draws; i++) {
      let sum = 0;
      for (let j = 0; j < nL; j++) sum += longs[Math.floor(rnd() * longs.length)].net;
      for (let j = 0; j < nS; j++) sum += shorts[Math.floor(rnd() * shorts.length)].net;
      if (sum / t.length >= obs) ge++;
    }
  } else ge = draws;
  return { rule, symbol, trades: t.length, mean: obs, controlTrades: c.length, controlMean: mean(c), p: (ge + 1) / (draws + 1) };
}

export type Verdict = "refuted" | "surviving" | "not testable";

/** The kill criteria above, applied to a held-out run. */
export function verdicts(turns: TurnScore[], overlays: OverlayScore[]): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const rule of PROCEDURE_RULES) {
    const dia = turns.find((t) => t.rule === rule && t.symbol === "DIA")!;
    const spy = turns.find((t) => t.rule === rule && t.symbol === "SPY")!;
    out[rule] = dia.windows < MIN_WINDOWS ? "not testable" : dia.p < PROCEDURE_CUTOFF && spy.hits > spy.expected ? "surviving" : "refuted";
  }
  for (const rule of TRADED_RULES) {
    const dia = overlays.find((o) => o.rule === rule && o.symbol === "DIA")!;
    out[`D on ${rule}`] = dia.trades < MIN_WINDOWS ? "not testable" : dia.p < PROCEDURE_CUTOFF ? "surviving" : "refuted";
  }
  return out;
}

export function heldOutRun() {
  const turns = PROCEDURE_RULES.flatMap((r) => PROCEDURE_SYMBOLS.map((s) => turnScore(r, s)));
  const overlays = TRADED_RULES.flatMap((r) => PROCEDURE_SYMBOLS.map((s) => overlayScore(r, s)));
  return { turns, overlays, verdicts: verdicts(turns, overlays) };
}
