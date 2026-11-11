/**
 * Gann's Rule 10, "Change in Trend in Bull Market", read on one completed
 * daily bar. Server only: no string here reaches a member.
 *
 * Source (Tier A): 45 Years in Wall Street (1949), ch. II p. 13, quoted in
 * full in the internal research package (gann-12-rules/.../sources/
 * gann_12_rules.md): "A change in trend often occurs just before or just
 * after holidays. The following dates are important. January 3, May 30,
 * July 4, the early part of September, after Labor Day, October 10 to 14,
 * November 3 to 8 in election years, and November 25 to 30, Thanksgiving,
 * and December 24 to 28." "... In a declining market when prices cross the
 * Top of the last upswing on a 9-Point Chart, or cross the top of the last
 * upswing on a 3-Day Chart, it is the First Signal for a Change in Trend."
 * "Always check to see if the market is exactly 1, 2, 3, 4 or 5 years from
 * any extreme High or Low price. Check back to see if the Time Period is 15,
 * 22, 34, 42, 48 or 49 months from any extreme or low price."
 *
 * This is a line-for-line port of the research code the rule was measured
 * with (gann_plan/entries.py `e10_change_in_trend`, swings.py
 * `three_day_chart`, `nine_point_chart`, `major_pivots`; G12 code
 * SHA256SUMS 01c56fd4), so the live card is the card the held-out read
 * scored (private-research/card-goodcall/PREREG-GC2.md and RESULT-GC2.md,
 * internal: paired with the RSI reversal card it made +0.22R a call on
 * 1,307 held-out fills, against +0.05R for the RSI cards outside it). A test
 * holds the port to the research code's output bar for bar
 * (`__tests__/changeInTrend.test.ts`). Window k = 2 days, as the research
 * Ctx. Points are Gann points (`pricePoint`, the same curve the research
 * ported). The one deliberate difference: the research tagged a quarter's
 * extreme "yearly" from the whole year in its data, which a bar in the last
 * two days of that year could see early; here only bars through the read
 * bar exist, so it never can.
 *
 * Read on bars from a fixed first session (`CHANGE_IN_TREND_FIRST_SESSION`),
 * the research data's first day, because the swing charts and "all time"
 * extremes depend on where the bars begin (the live feed's history starts
 * later, 2020-07-27; see `timedCards` in lib/cards/cardCalls.ts for what that
 * changes, measured).
 *
 * Three-question basis:
 * 1. Gann: as quoted (Tier A), carried one for one; Rule 10 marks a time
 *    (direction none) or a cross upward (direction up), both "agree" with a
 *    long, as the research recorded them.
 * 2. Cycles: the anniversaries and holiday dates are Gann's periods,
 *    postulated in advance (Dewey's criterion 7), measured only as a filter
 *    on the card, not as cycles in themselves.
 * 3. Hermetic: Rhythm (a turn at a dated return) and Gender (this receptive
 *    time window joined to the card's active price trigger). Law of
 *    Creation: price turn x time window, measured a creation (I = +0.17R
 *    over the card without it).
 */

import { pricePoint } from "@/lib/gann/pointScale";

/** The research data's first session; the charts are built from here. */
export const CHANGE_IN_TREND_FIRST_SESSION = "2018-01-02";
/** Days either side of a dated point, and bars back for a cross (research Ctx k). */
export const CHANGE_IN_TREND_K = 2;
const RULE10_YEARS = [1, 2, 3, 4, 5];
const RULE10_MONTHS = [15, 22, 34, 42, 48, 49];

export interface DailyBarLite {
  /** New York session date, YYYY-MM-DD. */
  date: string;
  h: number;
  l: number;
}

interface Pivot {
  idx: number;
  price: number;
  kind: "H" | "L";
  confirm: number;
  tags: string[];
}

function argmaxFirst(a: readonly number[], from: number, to: number): number {
  let best = from;
  for (let i = from + 1; i < to; i++) if (a[i] > a[best]) best = i;
  return best;
}
function argminFirst(a: readonly number[], from: number, to: number): number {
  let best = from;
  for (let i = from + 1; i < to; i++) if (a[i] < a[best]) best = i;
  return best;
}

/** Gann's 3-Day Chart signal state per bar: +1 after a cross of the last 3-day top, -1 after a break of the last 3-day bottom. */
export function threeDayTrend(h: readonly number[], l: readonly number[]): number[] {
  const N = h.length;
  const trend = new Array<number>(N).fill(0);
  let cur = 0;
  let ext = 0;
  let lastTop: number | null = null;
  let lastBot: number | null = null;
  let tr = 0;
  for (let t = 0; t < N; t++) {
    let up3 = false;
    let dn3 = false;
    if (t >= 3) {
      up3 = true;
      dn3 = true;
      for (let j = 0; j < 3; j++) {
        if (!(h[t - j] > h[t - j - 1] && l[t - j] > l[t - j - 1])) up3 = false;
        if (!(l[t - j] < l[t - j - 1])) dn3 = false;
      }
    }
    if (up3 && cur !== 1) {
      if (cur === -1) lastBot = l[ext];
      cur = 1;
      ext = argmaxFirst(h, t - 2, t + 1);
    } else if (dn3 && cur !== -1) {
      if (cur === 1) lastTop = h[ext];
      cur = -1;
      ext = argminFirst(l, t - 2, t + 1);
    } else if (cur === 1 && h[t] >= h[ext]) {
      ext = t;
    } else if (cur === -1 && l[t] <= l[ext]) {
      ext = t;
    }
    if (lastTop !== null && h[t] > lastTop && tr !== 1) tr = 1;
    if (lastBot !== null && l[t] < lastBot && tr !== -1) tr = -1;
    trend[t] = tr;
  }
  return trend;
}

/** Gann's 9-Point Swing Chart: direction per bar and pivots with the bar each is confirmed on. */
export function ninePointChart(h: readonly number[], l: readonly number[], points = 9): { d: number[]; pivots: Pivot[] } {
  const N = h.length;
  const d = new Array<number>(N).fill(0);
  const pivots: Pivot[] = [];
  let cur = 0;
  let hi = 0;
  let lo = 0;
  for (let t = 1; t < N; t++) {
    if (h[t] >= h[hi]) hi = t;
    if (l[t] <= l[lo]) lo = t;
    if (cur >= 0 && h[hi] - l[t] >= points * pricePoint(h[hi]) && hi < t) {
      pivots.push({ idx: hi, price: h[hi], kind: "H", confirm: t, tags: [] });
      cur = -1;
      lo = t;
    } else if (cur <= 0 && h[t] - l[lo] >= points * pricePoint(l[lo]) && lo < t) {
      pivots.push({ idx: lo, price: l[lo], kind: "L", confirm: t, tags: [] });
      cur = 1;
      hi = t;
    }
    d[t] = cur;
  }
  return { d, pivots };
}

/** Each completed calendar quarter's high and low, known from the next quarter's first bar, tagged yearly / all_time. */
export function majorPivots(dates: readonly string[], h: readonly number[], l: readonly number[]): Pivot[] {
  const N = dates.length;
  const q = dates.map((d) => d.slice(0, 4) + "Q" + Math.floor((Number(d.slice(5, 7)) - 1) / 3));
  const y = dates.map((d) => d.slice(0, 4));
  const starts = [0];
  for (let i = 1; i < N; i++) if (q[i] !== q[i - 1]) starts.push(i);
  const out: Pivot[] = [];
  let runHi = -Infinity;
  let runLo = Infinity;
  for (let si = 0; si < starts.length - 1; si++) {
    const s = starts[si];
    const e = starts[si + 1];
    const hiI = argmaxFirst(h, s, e);
    const loI = argminFirst(l, s, e);
    for (const [idx, kind] of [
      [hiI, "H"],
      [loI, "L"],
    ] as const) {
      const tags = ["quarterly"];
      const yr = y[idx];
      const y0 = y.indexOf(yr);
      const y1 = y.lastIndexOf(yr);
      if (y1 + 1 < N) {
        if ((kind === "H" && idx === argmaxFirst(h, y0, y1 + 1)) || (kind === "L" && idx === argminFirst(l, y0, y1 + 1))) tags.push("yearly");
      }
      if (kind === "H" && h[idx] > runHi) tags.push("all_time");
      if (kind === "L" && l[idx] < runLo) tags.push("all_time");
      out.push({ idx, price: kind === "H" ? h[idx] : l[idx], kind, confirm: e, tags });
    }
    for (let i = s; i < e; i++) {
      if (h[i] > runHi) runHi = h[i];
      if (l[i] < runLo) runLo = l[i];
    }
  }
  out.sort((a, b) => a.confirm - b.confirm || a.idx - b.idx);
  return out;
}

const DAY_MS = 86_400_000;
const dayNum = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;
const ymd = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY_MS;

export interface ChangeInTrend {
  fired: boolean;
  holiday: boolean;
  cross: boolean;
  anniversary: boolean;
}

/**
 * Pure. Rule 10 on bar `t` (default: the last bar), reading only bars 0..t.
 * `bars` are completed daily bars in session order, starting at
 * `CHANGE_IN_TREND_FIRST_SESSION` for the reading the research measured.
 */
export function changeInTrend(bars: readonly DailyBarLite[], t: number = bars.length - 1): ChangeInTrend {
  const none = { fired: false, holiday: false, cross: false, anniversary: false };
  if (t < 1 || t >= bars.length) return none;
  const upTo = bars.slice(0, t + 1);
  const dates = upTo.map((b) => b.date);
  const h = upTo.map((b) => b.h);
  const l = upTo.map((b) => b.l);
  if (![...h, ...l].every(Number.isFinite)) return none;
  const k = CHANGE_IN_TREND_K;
  const d = dates[t];
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const dn = dayNum(d);

  // (a) holidays and seasonal dates
  let holiday = [
    [1, 3],
    [5, 30],
    [7, 4],
  ].some(([m, dd]) => Math.abs(dn - ymd(year, m, dd)) <= k);
  if (month === 9) {
    const firstWeekday = new Date(Date.UTC(year, 8, 1)).getUTCDay(); // 0 Sunday
    const labor = 1 + ((8 - firstWeekday) % 7); // first Monday
    const since = dn - ymd(year, 9, labor);
    if (since >= 0 && since <= 7) holiday = true;
  }
  if ((month === 10 && day >= 10 && day <= 14) || (month === 11 && day >= 25 && day <= 30) || (month === 12 && day >= 24 && day <= 28)) holiday = true;
  if (month === 11 && day >= 3 && day <= 8 && year % 4 === 0) holiday = true;

  // (b) a cross of the last upswing's top, 3-Day or 9-Point chart, within the last k bars
  const tr3 = threeDayTrend(h, l);
  const nine = ninePointChart(h, l);
  let cross = false;
  for (let j = Math.max(1, t - k); j <= t; j++) {
    if (tr3[j] === 1 && tr3[j - 1] === -1) cross = true;
    if (nine.d[j - 1] === -1) {
      let top: Pivot | null = null;
      for (const p of nine.pivots) {
        if (p.confirm > j - 1) break;
        if (p.kind === "H") top = p;
      }
      if (top && h[j] > top.price && top.price >= h[j - 1]) cross = true;
    }
  }

  // (c) 1-5 years or 15, 22, 34, 42, 48, 49 months from a yearly or all-time extreme
  let anniversary = false;
  const months = [...RULE10_YEARS.map((n) => 12 * n), ...RULE10_MONTHS];
  for (const p of majorPivots(dates, h, l)) {
    if (p.confirm > t || !(p.tags.includes("yearly") || p.tags.includes("all_time"))) continue;
    const p0 = dates[p.idx];
    const py = Number(p0.slice(0, 4));
    const pm = Number(p0.slice(5, 7));
    const pd = Number(p0.slice(8, 10));
    for (const mo of months) {
      const mm = pm - 1 + mo;
      const y2 = py + Math.floor(mm / 12);
      const m2 = (mm % 12) + 1;
      const cap = m2 === 2 ? 28 : [4, 6, 9, 11].includes(m2) ? 30 : 31;
      if (Math.abs(dn - ymd(y2, m2, Math.min(pd, cap))) <= k) {
        anniversary = true;
        break;
      }
    }
    if (anniversary) break;
  }
  return { fired: holiday || cross || anniversary, holiday, cross, anniversary };
}
