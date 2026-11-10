/**
 * Section 4, the price-time square detector, and the per-symbol preparation
 * every later stage reads. RESEARCH ONLY.
 *
 * A PTS event fires on a bar whose low (for a bottom) or high (for a top)
 * trades within the band of a price cluster scoring >= kp while the bar sits
 * in a time window scoring >= kt. Gann: "when time and price balance, the
 * stock makes top or bottom" (Master Course, PDF p.202; Ch. 18 PDF p.440),
 * "TIME ... will overbalance both Space and Volume" (*Commodities* p.56).
 *
 * Creation Equation reading (owner's first principle): time (a) and price
 * (b) are the complementary pair; the PTS event is a (x) b. The study tests
 * the event against a alone, b alone and their non-interacting mixture
 * (`backtest.ts#creationCells`). The law shapes the design; only the
 * measured result decides anything.
 *
 * Look-ahead discipline: a time candidate counts on bar t only if it was
 * knowable at a close <= t; a level counts on bar t only if it was built
 * from bars <= t - 1 (sky levels are calendar facts, built with close t-1).
 */
import type { Bar } from "@/lib/types";
import { BarClock, dayNum } from "./calendar";
import { PRICE_FAMILIES, TIME_FAMILIES, type EngineConfig, type PriceFamily, type TimeFamily } from "./config";
import { buildLevels, levelAt, skyLevels, type Level } from "./price";
import { angDiff, norm360, sky, type Planet } from "./sky";
import { knownPivots, swingWalk, type Pivot, type SwingWalk } from "./swing";
import { gradeEvents, timeCandidates, type TimeCandidate } from "./time";

export const TBIT = Object.fromEntries(TIME_FAMILIES.map((f, i) => [f, 1 << i])) as Record<TimeFamily, number>;
export const PBIT = Object.fromEntries(PRICE_FAMILIES.map((f, i) => [f, 1 << i])) as Record<PriceFamily, number>;

export interface Prepared {
  symbol: string;
  bars: Bar[];
  dates: string[];
  clock: BarClock;
  major: SwingWalk;
  minor: SwingWalk;
  candidates: TimeCandidate[];
  /** Per bar: families with a window covering the bar. */
  timeMask: Uint32Array;
  /** Per bar: families with a level within the band of the bar's low / high. */
  lowMask: Uint32Array;
  highMask: Uint32Array;
  /** Per bar: the band used. */
  band: Float64Array;
  /** Per bar: a grading sky event within the major window. */
  skyEvent: Uint8Array;
  /** Level sets: built at bar `at` (usable from at + 1). */
  levelSets: { at: number; levels: Level[] }[];
}

function atr(bars: Bar[], t: number, n = 14): number {
  if (t < 1) return bars[0] ? bars[0].h - bars[0].l : 0;
  let s = 0;
  let k = 0;
  for (let i = Math.max(1, t - n + 1); i <= t; i++) {
    const b = bars[i];
    const pc = bars[i - 1].c;
    s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    k++;
  }
  return k ? s / k : 0;
}

export function maskFamilies<F extends string>(mask: number, fams: readonly F[]): F[] {
  return fams.filter((_, i) => mask & (1 << i));
}

export function scoreMask<F extends string>(mask: number, fams: readonly F[], weights: Record<F, number>): number {
  let s = 0;
  for (let i = 0; i < fams.length; i++) if (mask & (1 << i)) s += weights[fams[i]];
  return s;
}

/** Builds everything the detector, the triggers and the backtest read, once per symbol. */
export function prepare(symbol: string, bars: Bar[], cfg: EngineConfig, natal?: string | null): Prepared {
  const dates = bars.map((b) => b.t.slice(0, 10));
  const clock = new BarClock(dates);
  const major = swingWalk(bars, cfg.majorSwing);
  const minor = swingWalk(bars, cfg.minorSwingBars);
  const n = bars.length;
  const candidates = timeCandidates({ bars, dates, clock, pivots: major.pivots, cfg, natal });
  const timeMask = new Uint32Array(n);
  for (const c of candidates) {
    const bit = TBIT[c.family];
    for (let i = Math.max(c.index - c.tol, c.avail); i <= Math.min(n - 1, c.index + c.tol, c.expire - 1); i++) timeMask[i] |= bit;
  }

  // Level sets, rebuilt whenever a major pivot becomes known.
  const levelSets: { at: number; levels: Level[] }[] = [];
  const knownAts = [...new Set(major.pivots.map((p) => p.known))].sort((a, b) => a - b);
  for (const at of knownAts) {
    if (at >= n) continue;
    levelSets.push({ at, levels: buildLevels({ bars, dates, known: knownPivots(major.pivots, at), t: at, cfg }) });
  }

  const lowMask = new Uint32Array(n);
  const highMask = new Uint32Array(n);
  const band = new Float64Array(n);
  let si = -1;
  for (let t = 1; t < n; t++) {
    while (si + 1 < levelSets.length && levelSets[si + 1].at <= t - 1) si++;
    const prevClose = bars[t - 1].c;
    const bd = Math.max((cfg.bandPct / 100) * prevClose, cfg.bandAtr * atr(bars, t - 1));
    band[t] = bd;
    const lv = si >= 0 ? levelSets[si].levels : [];
    const sl = cfg.priceOn["P4.planet"] ? skyLevels(dayNum(dates[t]), prevClose) : [];
    const { l, h } = bars[t];
    let lm = 0;
    let hm = 0;
    for (const L of lv) {
      const p = levelAt(L, t);
      if (Math.abs(p - l) <= bd) lm |= PBIT[L.family];
      if (Math.abs(p - h) <= bd) hm |= PBIT[L.family];
    }
    for (const L of sl) {
      if (Math.abs(L.price - l) <= bd) lm |= PBIT[L.family];
      if (Math.abs(L.price - h) <= bd) hm |= PBIT[L.family];
    }
    lowMask[t] = lm;
    highMask[t] = hm;
  }

  const skyEvent = new Uint8Array(n);
  if (n > 0) {
    const ev = gradeEvents(clock.dayOf(0) - 5, clock.dayOf(n - 1) + 5);
    for (let t = 0; t < n; t++) {
      const d = clock.dayOf(t);
      for (let k = -cfg.windowBars.major; k <= cfg.windowBars.major; k++) if (ev.has(d + k)) skyEvent[t] = 1;
    }
  }
  return { symbol, bars, dates, clock, major, minor, candidates, timeMask, lowMask, highMask, band, skyEvent, levelSets };
}

export type Side = "bottom" | "top";

export interface PtsEvent {
  symbol: string;
  index: number;
  date: string;
  side: Side;
  grade: "A" | "B" | "C";
  timeScore: number;
  priceScore: number;
  timeFamilies: TimeFamily[];
  priceFamilies: PriceFamily[];
  /** Direction hints, each its own number: +1 favours an up move. */
  hints: { incoming: number; sky: number; angle: number; cycle: number };
}

export function timeScoreAt(P: Prepared, t: number, cfg: EngineConfig): number {
  return scoreMask(P.timeMask[t], TIME_FAMILIES, cfg.timeWeights);
}

export function priceScoreAt(P: Prepared, t: number, side: Side, cfg: EngineConfig): number {
  return scoreMask(side === "bottom" ? P.lowMask[t] : P.highMask[t], PRICE_FAMILIES, cfg.priceWeights);
}

/**
 * The PTS event on bar t for a side, or null. Reads nothing after bar t.
 * `withHints` adds the four direction hints (slower; the backtest skips them).
 */
export function ptsAt(P: Prepared, t: number, side: Side, cfg: EngineConfig, withHints = false): PtsEvent | null {
  if (t < 1) return null;
  // the incoming swing runs into the level: down into a bottom, up into a top
  if (P.minor.line[t - 1] !== (side === "bottom" ? -1 : 1)) return null;
  const ts = timeScoreAt(P, t, cfg);
  if (ts < cfg.kt) return null;
  const ps = priceScoreAt(P, t, side, cfg);
  if (ps < cfg.kp) return null;
  const grade = ts >= cfg.kt + 2 && ps >= cfg.kp + 2 && P.skyEvent[t] ? "A" : ts >= cfg.kt + 1 && ps >= cfg.kp + 1 ? "B" : "C";
  return {
    symbol: P.symbol,
    index: t,
    date: P.dates[t],
    side,
    grade,
    timeScore: ts,
    priceScore: ps,
    timeFamilies: maskFamilies(P.timeMask[t], TIME_FAMILIES),
    priceFamilies: maskFamilies(side === "bottom" ? P.lowMask[t] : P.highMask[t], PRICE_FAMILIES),
    hints: withHints ? directionHints(P, t) : { incoming: -P.minor.line[t - 1], sky: 0, angle: 0, cycle: 0 },
  };
}

/** The four direction hints of section 4, reported separately. */
export function directionHints(P: Prepared, t: number): PtsEvent["hints"] {
  const incoming = -P.minor.line[Math.max(0, t - 1)];
  // sky: soft (60/120) against hard (0/90/180) aspects within 3 degrees among Sun..Saturn
  const bodies: Planet[] = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  const d = P.clock.dayOf(t);
  let soft = 0;
  let hard = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = Math.abs(angDiff(sky().at(bodies[i], d), sky().at(bodies[j], d)));
      for (const a of [0, 90, 180]) if (Math.abs(sep - a) <= 3) hard++;
      for (const a of [60, 120]) if (Math.abs(sep - a) <= 3) soft++;
    }
  }
  const skyHint = Math.sign(soft - hard);
  // position against the 1x1 from the last major bottom known
  const known = knownPivots(P.major.pivots, t);
  const lastBot = [...known].reverse().find((p: Pivot) => p.kind === "bottom");
  let angle = 0;
  if (lastBot) {
    const set = [...P.levelSets].reverse().find((s) => s.at <= t - 1);
    const one = set?.levels.find((L) => L.family === "P3.angle" && L.rule.startsWith("1x1 up"));
    if (one) angle = P.bars[t].c >= levelAt(one, t) ? 1 : -1;
  }
  // cycle phase: the latest composite trough/peak window seen so far
  let cycle = 0;
  let best = -1;
  for (const c of P.candidates) {
    if (c.family !== "T7.cycle" || c.avail > t || c.avail < best) continue;
    best = c.avail;
    cycle = c.rule.startsWith("composite trough") ? (t <= c.index ? -1 : 1) : t <= c.index ? 1 : -1;
  }
  return { incoming, sky: skyHint, angle, cycle };
}

/** "Time has room" / "time is up" at a bar touching a level (section 4). */
export function timeState(P: Prepared, t: number, cfg: EngineConfig, look = 10): "in window" | "time has room" | "time is up" | "none" {
  if (timeScoreAt(P, t, cfg) >= cfg.kt) return "in window";
  for (let k = 1; k <= look && t + k < P.bars.length; k++) {
    // only windows knowable now count
    let mask = 0;
    for (const c of P.candidates) if (c.avail <= t && c.expire > t + k && Math.abs(c.index - (t + k)) <= c.tol) mask |= TBIT[c.family];
    if (scoreMask(mask, TIME_FAMILIES, cfg.timeWeights) >= cfg.kt) return "time has room";
  }
  for (let k = 1; k <= look && t - k >= 0; k++) if (timeScoreAt(P, t - k, cfg) >= cfg.kt) return "time is up";
  return "none";
}

export { norm360 };
