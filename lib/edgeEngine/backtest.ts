/**
 * Section 7: the backtest and its reports. RESEARCH ONLY.
 *
 * - `book`: capital in `capitalParts` equal parts (Gann, Master Course p.238),
 *   at most `maxOpen` open, marked to market daily, weekly returns at each
 *   week's last session. Same-day entries are ranked by grade, then by the
 *   PTS's combined score ("identify the best trade").
 * - `randomControl`: each booked trade's entry moved to a random session of
 *   the same symbol and calendar year, same stop distance in percent, same
 *   management; the p-value is the share of draws whose mean trade beats the
 *   engine's.
 * - `buyAndHold`: the equal-weight weekly return of every symbol, fully
 *   invested, and scaled to the book's exposure.
 * - `creationCells`: every minor-swing turn up, split by time window (a) and
 *   price cluster (b) at its bottom bar, all managed the same way. The
 *   interaction a (x) b - a - b + neither is the created third; a mixture
 *   reads zero.
 * - `sourceHitCounts` / `hitRates`: for each family, how often a bar it marks is a swing
 *   pivot, against the base rate.
 */
import { pricePoint } from "@/lib/gann/pointScale";
import { PRICE_FAMILIES, TIME_FAMILIES, type EngineConfig } from "./config";
import { PBIT, TBIT, priceScoreAt, timeScoreAt, type Prepared } from "./pts";
import { manageLong, type Entry, type Trade } from "./trade";

export const GRADE_RANK = { A: 0, B: 1, C: 2 } as const;

export interface WeekReturn {
  week: string; // date of the week's last session
  ret: number;
  exposure: number; // average fraction invested over the week's closes
}

export interface BookResult {
  weeks: WeekReturn[];
  taken: Trade[];
  skipped: number;
}

function weekKey(date: string): string {
  // ISO week: Monday-based; key by the Monday's date
  const d = new Date(date + "T00:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/** Books trades into a portfolio and returns weekly returns, between `from` and `to` (entry dates). */
export function book(trades: Trade[], prep: Map<string, Prepared>, cfg: EngineConfig, from: string, to: string): BookResult {
  const inRange = trades.filter((t) => {
    const d = prep.get(t.symbol)!.dates[t.index];
    return d >= from && d <= to;
  });
  const allDates = new Set<string>();
  for (const P of prep.values()) for (const d of P.dates) if (d >= from && d <= to) allDates.add(d);
  const days = [...allDates].sort();
  const byDay = new Map<string, Trade[]>();
  for (const t of inRange) {
    const d = prep.get(t.symbol)!.dates[t.index];
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(t);
  }
  const rank = (t: Trade) => (t.event ? GRADE_RANK[t.event.grade] * 1000 - (t.event.timeScore + t.event.priceScore) : 5000);
  let cash = 1;
  type Pos = { t: Trade; shares: number; P: Prepared; last: number };
  let open: Pos[] = [];
  const taken: Trade[] = [];
  let skipped = 0;
  const weeks: WeekReturn[] = [];
  let wkStartEq = 1;
  let wk = days.length ? weekKey(days[0]) : "";
  let wkExpSum = 0;
  let wkN = 0;
  let lastDay = "";
  const slip = cfg.slippageBp / 10_000;
  const equity = () => cash + open.reduce((s, p) => s + p.shares * p.last, 0);
  for (const day of days) {
    if (weekKey(day) !== wk) {
      const eq = equity();
      weeks.push({ week: lastDay, ret: eq / wkStartEq - 1, exposure: wkN ? wkExpSum / wkN : 0 });
      wkStartEq = eq;
      wk = weekKey(day);
      wkExpSum = 0;
      wkN = 0;
    }
    // exits on this day (at their price), then entries
    const still: Pos[] = [];
    for (const p of open) {
      const d = p.P.dates[p.t.exitIndex];
      if (d === day) cash += p.shares * p.t.exitPrice * (1 - slip);
      else still.push(p);
    }
    open = still;
    const todays = (byDay.get(day) ?? []).sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
    for (const t of todays) {
      if (open.length >= cfg.maxOpen || open.some((p) => p.t.symbol === t.symbol)) {
        skipped++;
        continue;
      }
      const alloc = Math.min(cash, equity() / cfg.capitalParts);
      if (alloc <= 0) {
        skipped++;
        continue;
      }
      const P = prep.get(t.symbol)!;
      const shares = alloc / (t.price * (1 + slip));
      cash -= alloc;
      open.push({ t, shares, P, last: t.price });
      taken.push(t);
      // a same-day stop-out
      if (P.dates[t.exitIndex] === day) {
        cash += shares * t.exitPrice * (1 - slip);
        open.pop();
      }
    }
    for (const p of open) {
      const i = p.P.dates.indexOf(day);
      if (i >= 0) p.last = p.P.bars[i].c;
    }
    const eq = equity();
    wkExpSum += eq > 0 ? (eq - cash) / eq : 0;
    wkN++;
    lastDay = day;
  }
  if (days.length) weeks.push({ week: lastDay, ret: equity() / wkStartEq - 1, exposure: wkN ? wkExpSum / wkN : 0 });
  return { weeks, taken, skipped };
}

export interface Summary {
  n: number;
  mean: number;
  t: number;
  positive: number; // share of traded weeks (exposure > 0) that were positive
  years: Record<string, number>;
  maxDrawdown: number;
}

export function summarizeWeeks(weeks: WeekReturn[]): Summary {
  const traded = weeks.filter((w) => w.exposure > 0);
  const xs = weeks.map((w) => w.ret);
  const n = xs.length;
  const mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const years: Record<string, number> = {};
  let eq = 1;
  let peak = 1;
  let dd = 0;
  for (const w of weeks) {
    const y = w.week.slice(0, 4);
    years[y] = (1 + (years[y] ?? 0)) * (1 + w.ret) - 1;
    eq *= 1 + w.ret;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, 1 - eq / peak);
  }
  return { n, mean, t: sd > 0 ? (mean / sd) * Math.sqrt(n) : 0, positive: traded.length ? traded.filter((w) => w.ret > 0).length / traded.length : 0, years, maxDrawdown: dd };
}

export interface TradeStats {
  trades: number;
  winRate: number;
  avgR: number;
  meanRet: number;
  profitFactor: number;
  expectancy: number;
  avgBars: number;
  exits: Record<string, number>;
}

export function tradeStats(ts: Trade[]): TradeStats {
  const n = ts.length;
  const wins = ts.filter((t) => t.ret > 0);
  const gw = wins.reduce((s, t) => s + t.ret, 0);
  const gl = -ts.filter((t) => t.ret <= 0).reduce((s, t) => s + t.ret, 0);
  const exits: Record<string, number> = {};
  for (const t of ts) exits[t.exitReason] = (exits[t.exitReason] ?? 0) + 1;
  return {
    trades: n,
    winRate: n ? wins.length / n : 0,
    avgR: n ? ts.reduce((s, t) => s + t.r, 0) / n : 0,
    meanRet: n ? ts.reduce((s, t) => s + t.ret, 0) / n : 0,
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0,
    expectancy: n ? ts.reduce((s, t) => s + t.ret, 0) / n : 0,
    avgBars: n ? ts.reduce((s, t) => s + t.bars, 0) / n : 0,
    exits,
  };
}

/** A small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random twin of a trade: same symbol and year, same stop distance, same management. */
export function randomTwin(P: Prepared, tr: Trade, cfg: EngineConfig, rand: () => number): Trade | null {
  const year = P.dates[tr.index].slice(0, 4);
  let lo = -1;
  let hi = -1;
  for (let i = 1; i < P.dates.length; i++) {
    if (P.dates[i].slice(0, 4) === year) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  if (lo < 0) return null;
  const i = lo + Math.floor(rand() * (hi - lo + 1));
  const px = P.bars[i].o;
  const stopPct = (tr.price - tr.stop) / tr.price;
  const en: Entry = { symbol: tr.symbol, trigger: tr.trigger, event: null, index: i, price: px, stop: px * (1 - stopPct), target: null, cancelUntil: tr.cancelUntil !== undefined ? i + 7 : undefined };
  return manageLong(P, en, cfg);
}

/** Matched random entries, `draws` times: the distribution of the mean trade, and the p-value of the engine's mean. */
export function randomControl(taken: Trade[], prep: Map<string, Prepared>, cfg: EngineConfig, draws: number, seed: number): { means: number[]; p: number; actual: number } {
  const rand = rng(seed);
  const actual = taken.length ? taken.reduce((s, t) => s + t.ret, 0) / taken.length : 0;
  const means: number[] = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    let k = 0;
    for (const t of taken) {
      const tw = randomTwin(prep.get(t.symbol)!, t, cfg, rand);
      if (tw) {
        s += tw.ret;
        k++;
      }
    }
    means.push(k ? s / k : 0);
  }
  const p = (means.filter((m) => m >= actual).length + 1) / (draws + 1);
  return { means, p, actual };
}

/** Equal-weight weekly return of every symbol, close to close, keyed like `book`'s weeks. */
export function buyAndHold(prep: Map<string, Prepared>, from: string, to: string): Map<string, number> {
  const sums = new Map<string, { s: number; n: number; last: string }>();
  for (const P of prep.values()) {
    let prevC: number | null = null;
    let wk = "";
    let wkLastC: number | null = null;
    let last = "";
    const flush = () => {
      if (prevC !== null && wkLastC !== null && wk) {
        const e = sums.get(wk) ?? { s: 0, n: 0, last: "" };
        e.s += wkLastC / prevC - 1;
        e.n++;
        if (last > e.last) e.last = last;
        sums.set(wk, e);
      }
    };
    for (let i = 0; i < P.dates.length; i++) {
      const d = P.dates[i];
      if (d < from || d > to) {
        if (d < from) prevC = P.bars[i].c;
        continue;
      }
      const k = weekKey(d);
      if (k !== wk) {
        flush();
        if (wkLastC !== null) prevC = wkLastC;
        wk = k;
      }
      wkLastC = P.bars[i].c;
      last = d;
    }
    flush();
  }
  const out = new Map<string, number>();
  for (const [, e] of [...sums.entries()].sort()) out.set(e.last, e.s / e.n);
  return out;
}

export interface Cell {
  n: number;
  mean: number;
  win: number;
}

/**
 * The creation test. Every minor-swing turn up is a candidate; its bottom bar
 * is classed by time (score >= kt) and price (score >= kp); each is bought at
 * the open after the turn with the same stop rule and management.
 */
export function creationTrades(P: Prepared, cfg: EngineConfig): { cell: "both" | "time" | "price" | "neither"; trade: Trade }[] {
  const out: { cell: "both" | "time" | "price" | "neither"; trade: Trade }[] = [];
  let busy = -1;
  for (const p of P.minor.pivots) {
    if (p.kind !== "bottom" || p.known + 1 >= P.bars.length || p.known <= busy || p.index < 1) continue;
    const b = p.index;
    const a = timeScoreAt(P, b, cfg) >= cfg.kt;
    const c = priceScoreAt(P, b, "bottom", cfg) >= cfg.kp;
    const px = P.bars[p.known + 1].o;
    const stop = p.price - pricePoint(p.price);
    if (px <= stop) continue;
    const tr = manageLong(P, { symbol: P.symbol, trigger: "E1", event: null, index: p.known + 1, price: px, stop, target: null }, cfg);
    out.push({ cell: a && c ? "both" : a ? "time" : c ? "price" : "neither", trade: tr });
    busy = tr.exitIndex;
  }
  return out;
}

export function cells(rows: { cell: string; trade: Trade }[]): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const k of ["both", "time", "price", "neither"]) {
    const xs = rows.filter((r) => r.cell === k).map((r) => r.trade.ret);
    out[k] = { n: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0, win: xs.length ? xs.filter((x) => x > 0).length / xs.length : 0 };
  }
  return out;
}

/** a (x) b - a - b + neither, from cell means: zero for a mixture. */
export function interaction(c: Record<string, Cell>): number {
  return c.both.mean - c.time.mean - c.price.mean + c.neither.mean;
}

/** Bootstrap the interaction by resampling symbols. */
export function interactionBootstrap(bySymbol: Map<string, { cell: string; trade: Trade }[]>, draws: number, seed: number): { lo: number; hi: number; pPositive: number } {
  const rand = rng(seed);
  const syms = [...bySymbol.keys()];
  const vals: number[] = [];
  for (let d = 0; d < draws; d++) {
    const rows: { cell: string; trade: Trade }[] = [];
    for (let k = 0; k < syms.length; k++) rows.push(...bySymbol.get(syms[Math.floor(rand() * syms.length)])!);
    const c = cells(rows);
    if (c.both.n && c.time.n && c.price.n && c.neither.n) vals.push(interaction(c));
  }
  vals.sort((a, b) => a - b);
  return { lo: vals[Math.floor(0.025 * vals.length)] ?? NaN, hi: vals[Math.floor(0.975 * vals.length)] ?? NaN, pPositive: vals.filter((v) => v > 0).length / Math.max(1, vals.length) };
}

export interface HitCounts {
  bars: number;
  nearPivot: number;
  nearBottom: number;
  marked: Record<string, number>;
  hits: Record<string, number>;
}

/**
 * Raw tallies for the per-source hit rates: for each time family, bars it
 * marks and how many sit within +-1 bar of a minor pivot; for each price
 * family, bars whose low it marks and how many are within +-1 of a minor bottom.
 */
export function sourceHitCounts(preps: Prepared[], from: string, to: string): HitCounts {
  const out: HitCounts = { bars: 0, nearPivot: 0, nearBottom: 0, marked: {}, hits: {} };
  for (const P of preps) {
    const near = new Uint8Array(P.bars.length);
    const nearBot = new Uint8Array(P.bars.length);
    for (const p of P.minor.pivots) for (let k = -1; k <= 1; k++) {
      const i = p.index + k;
      if (i >= 0 && i < near.length) {
        near[i] = 1;
        if (p.kind === "bottom") nearBot[i] = 1;
      }
    }
    for (let t = 1; t < P.bars.length; t++) {
      const d = P.dates[t];
      if (d < from || d > to) continue;
      out.bars++;
      out.nearPivot += near[t];
      out.nearBottom += nearBot[t];
      for (const f of TIME_FAMILIES) if (P.timeMask[t] & TBIT[f]) {
        out.marked[f] = (out.marked[f] ?? 0) + 1;
        out.hits[f] = (out.hits[f] ?? 0) + near[t];
      }
      for (const f of PRICE_FAMILIES) if (P.lowMask[t] & PBIT[f]) {
        out.marked[f] = (out.marked[f] ?? 0) + 1;
        out.hits[f] = (out.hits[f] ?? 0) + nearBot[t];
      }
    }
  }
  return out;
}

export function mergeHitCounts(xs: HitCounts[]): HitCounts {
  const out: HitCounts = { bars: 0, nearPivot: 0, nearBottom: 0, marked: {}, hits: {} };
  for (const x of xs) {
    out.bars += x.bars;
    out.nearPivot += x.nearPivot;
    out.nearBottom += x.nearBottom;
    for (const [k, v] of Object.entries(x.marked)) out.marked[k] = (out.marked[k] ?? 0) + v;
    for (const [k, v] of Object.entries(x.hits)) out.hits[k] = (out.hits[k] ?? 0) + v;
  }
  return out;
}

/** Hit rate and lift per family: time families against the pivot base rate, price families against the bottom base rate. */
export function hitRates(c: HitCounts): { family: string; marked: number; hit: number; base: number; lift: number }[] {
  return [...TIME_FAMILIES, ...PRICE_FAMILIES].map((f) => {
    const isTime = (TIME_FAMILIES as readonly string[]).includes(f);
    const base = c.bars ? (isTime ? c.nearPivot : c.nearBottom) / c.bars : 0;
    const m = c.marked[f] ?? 0;
    const hit = m ? (c.hits[f] ?? 0) / m : 0;
    return { family: f, marked: c.bars ? m / c.bars : 0, hit, base, lift: base > 0 ? hit / base : 0 };
  });
}
