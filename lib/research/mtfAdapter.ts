/**
 * MTF-R0.1 input adapter: emits the engine's input contract
 * (`mtfCandidate.ts`) from a pinned daily-bar snapshot, using GSPS's existing
 * swing-chart pivots, main-trend reader and session calendar. Research only;
 * nothing on the verdict, scan, plan or order path imports it.
 *
 * Every choice below is fixed before any market scoring (preregistration:
 * docs/research/mtf-r0-1/PREREGISTRATION.md). Source rules and engineering
 * choices are kept apart.
 *
 * Source-grounded:
 * - Major anchors are the instrument's own major tops and bottoms read on its
 *   monthly chart, "the most important chart of all in determining the main
 *   trend" (ref: R-001 GA-2/3, A2.1): Gann's monthly swing chart
 *   (`walkSwingChart` with the 7-day rule on monthly bars, as
 *   `lib/gann/mainTrend.ts` reads it), the trend turning on crossing the last
 *   swing top or breaking the last swing bottom (ref: R-004 pp. 19-20, A05). A major
 *   top is the highest monthly high of a completed up campaign (from one
 *   main-trend change to the next); a major bottom, the lowest low of a
 *   completed down campaign. Each becomes known when the trend changes, and
 *   only months closed by the issue session are read.
 * - Reaction anchors are minor pivots: the last completed swing of the 3-Day
 *   Chart (ref: R-005, Ch. VII, p. 62; `THREE_DAY_CHART`), known on the bar
 *   that reversed the line (the chart is a one-pass walk, so its pivots
 *   confirmed by a bar never change with later bars).
 * - The ordinary / rapid choice follows the package's reading of the source:
 *   ordinary reactions run 2 to 4 weeks, rapid culminations 6 to 7 weeks.
 *
 * Engineering choices (not Gann's words):
 * - Mode: a leg running with the monthly main trend is read as the move that
 *   can culminate rapidly (42-49 days); a leg against it as an ordinary
 *   reaction (14-28 days). With no main trend read (fewer than 6 closed
 *   months, `MIN_MAIN_TREND_MONTHS`) no reaction anchor is emitted, so no
 *   duration projection and no forecast.
 * - Trend for the expected type (step 9) is the 3-Day Chart's current line:
 *   a leg up from a bottom is "up" (top watch), down from a top is "down"
 *   (bottom watch). The same leg the duration counts, so type and timing
 *   describe one move. No pivot yet: "unknown".
 * - Episodes: anchors whose dates lie within 14 calendar days of each other
 *   (single linkage) are one episode, so a recent major turn and the daily
 *   pivot at the same turn never count as two independent votes. 14 days is
 *   the ordinary reaction's lower bound.
 * - Horizon: 91 calendar days after the issue session (a quarter-year).
 * - Months closed: a month is closed at issue when the issue session is its
 *   last session, by the supplied calendar.
 * - Close-only data (the long Dow record) is read with high = low = close.
 *
 * Three-question basis: see `mtfCandidate.ts`.
 */
import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart, type SwingChartWalk } from "@/lib/gann/swingChart";
import { MIN_MAIN_TREND_MONTHS } from "@/lib/gann/mainTrend";
import { R01_INPUT_CONTRACT, addDays, dayNumber, type MajorAnchor, type R01Input, type ReactionAnchor, type Trend } from "@/lib/research/mtfCandidate";

export const ADAPTER_VERSION = "mtf-adapter-1";
export const HORIZON_DAYS = 91;
export const EPISODE_GAP_DAYS = 14;

export interface PinnedSeries {
  symbol: string;
  /** Daily bars, `t` the session label YYYY-MM-DD, oldest first. */
  bars: Bar[];
  /** SHA-256 of the snapshot the bars came from. */
  snapshotHash: string;
  source: string;
}

/** Null-control hooks (`mtfEvaluate.ts`). Zero for R0.1 itself. */
export interface AdapterShift {
  majorMonths?: number;
  reactionDays?: number;
}

interface MonthBar extends Bar {
  /** Index of the first and last daily bar of the month. */
  first: number;
  last: number;
}

/** Everything the adapter derives once per series; each issue reads a causal prefix of it. */
export interface Prepared {
  series: PinnedSeries;
  months: MonthBar[];
  monthWalk: SwingChartWalk;
  /** Trend after each monthly trend change, aligned with monthWalk.trendChanges. */
  monthTrendAfter: ("bullish" | "bearish")[];
  dailyWalk: SwingChartWalk;
  /** Major anchors with the month index at which each became known. */
  majors: { anchor: Omit<MajorAnchor, "episode">; knownMonth: number }[];
}

const ym = (t: string) => t.slice(0, 7);

export function monthlyBars(bars: Bar[]): MonthBar[] {
  const out: MonthBar[] = [];
  bars.forEach((b, i) => {
    const last = out.at(-1);
    if (last && ym(last.t) === ym(b.t)) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
      last.last = i;
    } else out.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, first: i, last: i });
  });
  return out;
}

/** The trend after each trend change: the first follows the first swing, then each change flips it. */
function trendsAfterChanges(walk: SwingChartWalk): ("bullish" | "bearish")[] {
  if (!walk.trendChanges.length) return [];
  const origin = walk.pivots[0];
  const first: "bullish" | "bearish" = origin.kind === "bottom" ? "bullish" : "bearish";
  return walk.trendChanges.map((_, j) => (j % 2 === 0 ? first : first === "bullish" ? "bearish" : "bullish"));
}

/** The daily session within month `m` holding its high (top) or low (bottom); ties to the earliest. */
function extremeSession(bars: Bar[], m: MonthBar, kind: "top" | "bottom"): number {
  let k = m.first;
  for (let i = m.first; i <= m.last; i++) if (kind === "top" ? bars[i].h > bars[k].h : bars[i].l < bars[k].l) k = i;
  return k;
}

export function prepare(series: PinnedSeries): Prepared {
  const { bars } = series;
  const months = monthlyBars(bars);
  const monthWalk = walkSwingChart(months, WEEKLY_SWING_CHART);
  const monthTrendAfter = trendsAfterChanges(monthWalk);
  const majors: Prepared["majors"] = [];
  // A campaign runs from one trend change to the next; its extreme is known at the next change.
  for (let j = 0; j + 1 < monthWalk.trendChanges.length; j++) {
    const a = monthWalk.trendChanges[j];
    const b = monthWalk.trendChanges[j + 1];
    const kind = monthTrendAfter[j] === "bullish" ? "top" : "bottom";
    let best = a;
    for (let m = a; m <= b; m++) if (kind === "top" ? months[m].h > months[best].h : months[m].l < months[best].l) best = m;
    const k = extremeSession(bars, months[best], kind);
    majors.push({
      anchor: {
        id: `major:${bars[k].t}:${kind}`,
        date: bars[k].t,
        kind,
        confirmed: bars[months[b].last].t,
        source: `monthly swing chart, ${kind === "top" ? "up" : "down"} campaign ${ym(months[a].t)} to ${ym(months[b].t)}`,
      },
      knownMonth: b,
    });
  }
  return { series, months, monthWalk, monthTrendAfter, dailyWalk: walkSwingChart(bars, THREE_DAY_CHART), majors };
}

/** Index of the last month closed at daily session `e`: `e` is its month's last session, else the month before. */
export function lastClosedMonth(p: Prepared, e: number, isLastSessionOfMonth: (e: number) => boolean): number {
  let lo = 0;
  let hi = p.months.length - 1;
  let m = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (p.months[mid].first <= e) {
      m = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return isLastSessionOfMonth(e) ? m : m - 1;
}

/** The monthly main trend at the close of month `L`, or null on too short a record. */
export function mainTrendAt(p: Prepared, L: number): "bullish" | "bearish" | null {
  if (L + 1 < MIN_MAIN_TREND_MONTHS) return null;
  let t: "bullish" | "bearish" | null = null;
  p.monthWalk.trendChanges.forEach((idx, j) => {
    if (idx <= L) t = p.monthTrendAfter[j];
  });
  return t;
}

/** Labels anchors within EPISODE_GAP_DAYS of each other as one episode (single linkage). */
export function assignEpisodes<T extends { id: string; date: string }>(anchors: T[]): (T & { episode: string })[] {
  const sorted = [...anchors].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const out: (T & { episode: string })[] = [];
  let label = "";
  let lastDay = -Infinity;
  for (const a of sorted) {
    const d = dayNumber(a.date);
    if (d - lastDay > EPISODE_GAP_DAYS) label = `ep:${a.date}`;
    lastDay = d;
    out.push({ ...a, episode: label });
  }
  return out;
}

/**
 * The engine input after daily session `e` has closed. Reads only bars up to
 * `e` and months closed by then. `shift` moves anchors for the null controls.
 */
export function buildInput(p: Prepared, e: number, isLastSessionOfMonth: (e: number) => boolean, shift: AdapterShift = {}): R01Input {
  const bars = p.series.bars;
  const issue = bars[e].t;
  const L = lastClosedMonth(p, e, isLastSessionOfMonth);
  let majors = p.majors.filter((m) => m.knownMonth <= L).map((m) => ({ ...m.anchor }));
  if (shift.majorMonths) {
    // The null moves every major anchor's calendar phase together, keeping their spacing.
    for (const m of majors) {
      const [y, mo, d] = m.date.split("-").map(Number);
      const mi = y * 12 + mo - 1 + shift.majorMonths;
      m.date = `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`;
      if (m.confirmed < m.date) m.confirmed = m.date;
      m.id = `${m.id}~${shift.majorMonths}m`;
    }
    majors = majors.filter((m) => m.confirmed <= issue);
  }

  // The last 3-Day Chart pivot confirmed by session e: pivots[k] completes on reversals[k - 1].
  const w = p.dailyWalk;
  let k = -1;
  for (let i = w.reversals.length - 1; i >= 0; i--) {
    if (w.reversals[i] <= e) {
      k = i + 1;
      break;
    }
  }
  const pivot = k >= 1 ? w.pivots[k] : null;
  const trend: Trend = pivot ? (pivot.kind === "bottom" ? "up" : "down") : "unknown";
  const main = mainTrendAt(p, L);
  const reactions: Omit<ReactionAnchor, "episode">[] = [];
  if (pivot && main) {
    const withTrend = (main === "bullish") === (pivot.kind === "bottom");
    let date = bars[pivot.index].t;
    let confirmed = bars[w.reversals[k - 1]].t;
    if (shift.reactionDays) {
      date = addDays(date, shift.reactionDays);
      if (confirmed < date) confirmed = date;
    }
    if (confirmed <= issue) {
      reactions.push({
        id: `reaction:${bars[pivot.index].t}:${pivot.kind}${shift.reactionDays ? `~${shift.reactionDays}d` : ""}`,
        date,
        kind: pivot.kind,
        confirmed,
        mode: withTrend ? "rapid" : "ordinary",
        modeSource: `3-Day Chart leg ${pivot.kind === "bottom" ? "up" : "down"} ${withTrend ? "with" : "against"} the ${main} monthly main trend`,
        source: "3-Day Chart, last completed swing",
      });
    }
  }
  const all = assignEpisodes([...majors.map((m) => ({ ...m, role: "major" as const })), ...reactions.map((r) => ({ ...r, role: "reaction" as const }))]);
  const strip = <T extends { role: string }>(a: T) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== "role"));
  return {
    contract: R01_INPUT_CONTRACT,
    symbol: p.series.symbol,
    issueSession: issue,
    horizonEnd: addDays(issue, HORIZON_DAYS),
    trend,
    trendSource: pivot ? `3-Day Chart line from the ${pivot.kind} of ${bars[pivot.index].t}` : "no completed 3-Day Chart swing",
    majorAnchors: all.filter((a) => a.role === "major").map(strip) as unknown as MajorAnchor[],
    reactionAnchors: all.filter((a) => a.role === "reaction").map(strip) as unknown as ReactionAnchor[],
    lineage: { adapter: ADAPTER_VERSION, snapshot: p.series.snapshotHash, source: p.series.source },
  };
}
