/**
 * Section 3, the price engine: levels from every source, each with its rule
 * label. RESEARCH ONLY.
 *
 * Gann's own text behind the sources (records in docs/memory-bank/sources/):
 * - 50% of a range is the strongest level, then the other eighths and thirds
 *   (Master Course, A2_1, the "Resistance Levels" chapter; *45 Years in Wall
 *   Street* Ch. IV, percentages of the high and low).
 * - Angles are a rate of price per unit of time, 1x1 strongest, "strong above
 *   the 1x1, weak below", and a break drops price to the next angle (Master
 *   Course, the angle chapters; `lib/gann/fans.ts`).
 * - The Square of Nine (Master Course, Square of Nine chapter; `lib/gann/squareOf9.ts`).
 * - Old tops become bottoms (*Truth of the Stock Tape*, A02).
 * - Double and triple bottoms (*New Stock Trend Detector* p.20).
 * The other families (quarter-step rings, 6.25% multiples, planetary price
 * lines, the 144 box, AB=CD and the median line) come from the handoff's
 * secondary sources; the private ledger names them. Scaling choices for
 * stock prices are engineering choices, labelled where they are made.
 */
import { pricePoint } from "@/lib/gann/pointScale";
import type { Bar } from "@/lib/types";
import type { EngineConfig, PriceFamily } from "./config";
import { norm360, sky, type Planet } from "./sky";
import { flipLevels, multiples, runStats, type Pivot } from "./swing";
import { isoDay } from "./calendar";

export interface Level {
  family: PriceFamily;
  rule: string;
  /** Price at bar `t0`; a sloped level moves `slope` per bar. */
  price: number;
  slope?: number;
  t0?: number;
}

export function levelAt(l: Level, t: number): number {
  return l.slope ? l.price + l.slope * (t - (l.t0 ?? 0)) : l.price;
}

const f2 = (x: number) => x.toFixed(2);
const pv = (p: Pivot, dates: string[]) => `${p.kind} ${dates[p.index]?.slice(0, 10) ?? p.index} @ ${f2(p.price)}`;

/** P1 dynamic: (sqrt P +- n/4)^2 for each 45-degree step to 360 (= +-2 on the root). */
export function squareOfNineDynamic(p: number): { price: number; deg: number }[] {
  const r = Math.sqrt(p);
  const out: { price: number; deg: number }[] = [];
  for (let n = 1; n <= 8; n++) {
    out.push({ price: (r + n / 4) ** 2, deg: n * 45 });
    if (r - n / 4 > 0) out.push({ price: (r - n / 4) ** 2, deg: -n * 45 });
  }
  return out;
}

/** P1 degree formula: (sqrt P +- d/180)^2. */
export function squareOfNineDegree(p: number, d: number): number {
  return (Math.sqrt(p) + d / 180) ** 2;
}

/** P1 static: odd squares, even squares and even squares + 1 between lo and hi. */
export function squareOfNineStatic(lo: number, hi: number): { price: number; kind: string }[] {
  const out: { price: number; kind: string }[] = [];
  for (let k = Math.max(1, Math.floor(Math.sqrt(Math.max(0, lo)))); k * k <= hi + 1; k++) {
    const sq = k * k;
    if (sq >= lo && sq <= hi) out.push({ price: sq, kind: k % 2 ? "odd square" : "even square" });
    if (k % 2 === 0 && sq + 1 >= lo && sq + 1 <= hi) out.push({ price: sq + 1, kind: "even square + 1" });
  }
  return out;
}

/** P1 ring: between consecutive odd squares, 8 equal steps (25 -> 28, 31 ... 49). */
export function ringSteps(oddRoot: number): number[] {
  const a = oddRoot * oddRoot;
  const b = (oddRoot + 2) * (oddRoot + 2);
  return Array.from({ length: 8 }, (_, i) => a + ((b - a) * (i + 1)) / 8);
}

/** P1 quarter-step squares around a price: (m + j/4)^2, m = floor(sqrt P). */
export function quarterSquares(p: number, span = 4): number[] {
  const m = Math.floor(Math.sqrt(p));
  const out: number[] = [];
  for (let j = -span; j <= span; j++) if (m + j / 4 > 0) out.push((m + j / 4) ** 2);
  return out;
}

/** Degrees moved on the square between two prices: (sqrt a - sqrt b) x 180. */
export function squareDegrees(a: number, b: number): number {
  return (Math.sqrt(a) - Math.sqrt(b)) * 180;
}

/** P2: eighths and thirds of a range, and its extensions. */
export function rangeDivisions(lo: number, hi: number): { price: number; frac: number }[] {
  const r = hi - lo;
  const fr = [1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8, 1 / 3, 2 / 3];
  return fr.map((f) => ({ price: lo + r * f, frac: f }));
}

export function rangeExtensions(lo: number, hi: number): { price: number; frac: number }[] {
  const r = hi - lo;
  const out: { price: number; frac: number }[] = [];
  for (const f of [1.25, 1.5, 1.75, 2.0]) {
    out.push({ price: lo + r * f, frac: f });
    out.push({ price: hi - r * f, frac: -f });
  }
  return out.filter((x) => x.price > 0);
}

/** P2 percentages: 6.25% multiples down from a high and up from a low. */
export function percentLevels(lo: number, hi: number, steps = 8): { price: number; rule: string }[] {
  const out: { price: number; rule: string }[] = [];
  for (let k = 1; k <= steps; k++) {
    out.push({ price: hi * (1 - k * 0.0625), rule: `high - ${(k * 6.25).toFixed(2)}%` });
    out.push({ price: lo * (1 + k * 0.0625), rule: `low + ${(k * 6.25).toFixed(2)}%` });
  }
  return out;
}

/** Angle rates (price units per bar), the handoff's set with the 1x1 first. */
export const ANGLES: readonly [string, number][] = [["1x1", 1], ["2x1", 2], ["1x2", 0.5], ["4x1", 4], ["1x4", 0.25], ["8x1", 8], ["16x1", 16]];

/** The price scale for planetary lines: one circle of 360 covers the price (engineering choice). */
export function circleScale(price: number): number {
  return 10 ** Math.ceil(Math.log10(Math.max(price, 1e-6) / 360));
}

/** P4: planet longitude (+ aspect) as price, every circle within lo..hi, on `scale`. */
export function planetaryLines(day: number, lo: number, hi: number, scale: number): { price: number; rule: string }[] {
  const s = sky();
  const out: { price: number; rule: string }[] = [];
  const bodies: Planet[] = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  const add = (deg: number, rule: string) => {
    for (let k = Math.floor(lo / scale / 360) - 1; k <= Math.ceil(hi / scale / 360) + 1; k++) {
      const p = (deg + 360 * k) * scale;
      if (p >= lo && p <= hi) out.push({ price: p, rule: `${rule} ${deg.toFixed(1)} deg, circle ${k}, x${scale}` });
    }
  };
  for (const b of bodies) for (const a of [0, 90, 120]) add(norm360(s.at(b, day) + a), `${b}${a ? ` +${a}` : ""}`);
  const node = s.at("Node", day);
  add(node, "North node");
  add(norm360(node + 180), "South node");
  return out;
}

/** P5: the 144 box from a major low, its eighths and thirds (scale: an engineering choice). */
export function box144(low: number): { price: number; rule: string }[] {
  const unit = 10 ** (Math.floor(Math.log10(Math.max(low, 1e-6))) - 2);
  const side = 144 * unit;
  const out: { price: number; rule: string }[] = [];
  for (let j = 1; j <= 16; j++) out.push({ price: low + (side * j) / 8, rule: `box144 ${j}/8` });
  for (let j = 1; j <= 6; j++) out.push({ price: low + (side * j) / 3, rule: `box144 ${j}/3` });
  return out;
}

export interface LevelContext {
  bars: Bar[];
  dates: string[];
  /** Major pivots known at the bar the levels are built for. */
  known: Pivot[];
  /** Bar the levels are built at (its close is known). */
  t: number;
  cfg: EngineConfig;
}

/**
 * Levels that do not move between pivot confirmations (rebuilt each time a
 * new major pivot becomes known) plus the sloped ones (angles, median line).
 */
export function buildLevels(ctx: LevelContext): Level[] {
  const { bars, dates, known, t, cfg } = ctx;
  const on = cfg.priceOn;
  const out: Level[] = [];
  const recent = known.slice(-cfg.levelPivots);
  const close = bars[t].c;
  const lo = close * 0.7;
  const hi = close * 1.3;
  const push = (family: PriceFamily, price: number, rule: string, slope?: number, t0?: number) => {
    if (!on[family] || !(price > 0)) return;
    if (slope === undefined && (price < lo || price > hi)) return;
    out.push({ family, price, rule, slope, t0 });
  };

  for (const p of recent) {
    if (on["P1.dynamic"]) for (const x of squareOfNineDynamic(p.price)) push("P1.dynamic", x.price, `sqrt-step ${x.deg > 0 ? "+" : ""}${x.deg} deg from ${pv(p, dates)}`);
  }
  if (on["P1.static"]) for (const x of squareOfNineStatic(lo, hi)) push("P1.static", x.price, x.kind);
  if (on["P1.ring"]) for (const x of quarterSquares(close, 6)) push("P1.ring", x, `quarter-step square ${f2(Math.sqrt(x))}^2`);

  // P2 on the last major range and on the whole recorded range.
  const lastTop = [...recent].reverse().find((p) => p.kind === "top");
  const lastBot = [...recent].reverse().find((p) => p.kind === "bottom");
  const ranges: [number, number, string][] = [];
  if (lastTop && lastBot) ranges.push([lastBot.price, lastTop.price, "last range"]);
  let rlo = Infinity;
  let rhi = -Infinity;
  for (let i = 0; i <= t; i++) {
    if (bars[i].l < rlo) rlo = bars[i].l;
    if (bars[i].h > rhi) rhi = bars[i].h;
  }
  ranges.push([rlo, rhi, "recorded range"]);
  for (const [a, b, name] of ranges) {
    for (const x of rangeDivisions(a, b)) push(x.frac === 0.5 ? "P2.half" : "P2.eighths", x.price, `${name} ${(x.frac * 100).toFixed(1)}%`);
    for (const x of rangeExtensions(a, b)) push("P2.ext", x.price, `${name} x${x.frac}`);
    for (const x of percentLevels(a, b)) push("P2.pct", x.price, `${name} ${x.rule}`);
  }

  // P3 angles from the last major top and bottom.
  for (const p of [lastTop, lastBot]) {
    if (!p || !on["P3.angle"]) continue;
    const u = pricePoint(p.price);
    for (const [name, r] of ANGLES) push("P3.angle", p.price, `${name} ${p.kind === "bottom" ? "up" : "down"} from ${pv(p, dates)}`, (p.kind === "bottom" ? 1 : -1) * r * u, p.index);
  }

  // P5 from the lowest recent bottom.
  const bots = recent.filter((p) => p.kind === "bottom");
  if (bots.length && on["P5.box144"]) {
    const low = bots.reduce((m, p) => (p.price < m.price ? p : m));
    for (const x of box144(low.price)) push("P5.box144", x.price, `${x.rule} from ${pv(low, dates)}`);
  }

  // P6 AB=CD with 0.618/0.786 and 1.27/1.618, and the median line, from the last three pivots.
  if (recent.length >= 3) {
    const [A, B, C] = recent.slice(-3);
    push("P6.abcd", C.price + (B.price - A.price), `AB=CD from ${pv(C, dates)}`);
    for (const f of [0.618, 0.786]) push("P6.abcd", B.price - f * (B.price - A.price), `AB ${f} retracement`);
    for (const k of [1.27, 1.618]) push("P6.abcd", C.price + k * (B.price - C.price), `BC x${k} extension`);
    const midI = (B.index + C.index) / 2;
    const midP = (B.price + C.price) / 2;
    if (midI > A.index) {
      const slope = (midP - A.price) / (midI - A.index);
      push("P6.fork", A.price, `median line from ${pv(A, dates)}`, slope, A.index);
      push("P6.fork", B.price, `upper/lower parallel through ${pv(B, dates)}`, slope, B.index);
      push("P6.fork", C.price, `upper/lower parallel through ${pv(C, dates)}`, slope, C.index);
    }
  }

  // Swing levels.
  for (const m of multiples(known, "bottom", cfg.doubleTolPct)) push("S.double", m.level, `${m.tests === 2 ? "double" : "triple"} bottom`);
  for (const m of multiples(known, "top", cfg.doubleTolPct)) push("S.double", m.level, `${m.tests === 2 ? "double" : "triple"} top`);
  for (const f of flipLevels(known, close)) push("S.flip", f.level, `old ${f.role === "support" ? "top now support" : "bottom now resistance"}`);
  const rs = runStats(known, cfg.runLookback);
  if (rs.projection) push("S.run", rs.projection.price, `average run from ${pv(rs.projection.from, dates)}`);

  return out;
}

/** P4 levels move with the sky, so they are built for each bar's own day. */
export function skyLevels(day: number, close: number): Level[] {
  return planetaryLines(day, close * 0.7, close * 1.3, circleScale(close)).map((x) => ({ family: "P4.planet" as const, price: x.price, rule: x.rule }));
}

/** The day a level set was built, for labels. */
export const levelDay = (dates: string[], t: number) => isoDay(Math.floor(Date.parse(dates[t].slice(0, 10)) / 86_400_000));
