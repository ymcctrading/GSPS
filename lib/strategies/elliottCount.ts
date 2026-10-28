/**
 * Elliott Wave counter (owner, 2026-10-28: "GSPS should compute Elliott
 * Wave"). One shared count, read by the `elliottWave` Strategy Mode, its
 * explain-the-math reading, the chart overlay and the School's live examples,
 * so every surface shows the same waves.
 *
 * What it counts. R. N. Elliott's wave principle (*The Wave Principle*, 1938;
 * the rules as Frost and Prechter set them out in *Elliott Wave Principle*,
 * 1978): a trend moves in five waves (1-2-3-4-5) and is corrected in three
 * (A-B-C). A five-wave count is valid only if it keeps the three fixed rules:
 *   1. wave 2 never retraces past the start of wave 1;
 *   2. wave 3 is never the shortest of waves 1, 3 and 5;
 *   3. wave 4 never enters wave 1's price range.
 * The guidelines (wave 2 often retracing 50-62% of wave 1, wave 3 often about
 * 1.618 times wave 1, alternation between waves 2 and 4, a truncated fifth)
 * are reported as notes, never required. The correction counted is the
 * zigzag: B does not pass the start of A, and C goes beyond the end of A.
 *
 * Counts are interpretive and more than one is often valid. This returns the
 * most recent count that keeps the rules, and every surface that shows it says
 * so ("one valid count; others are possible"). It is never a forecast.
 *
 * Engineering choices, labelled: swing points come from a zigzag that turns
 * when price moves `ZIGZAG_ATR_MULT` times the 14-bar ATR against the running
 * extreme (Elliott gives no swing filter; this keeps the count to the moves a
 * reader sees on the chart). Diagonal triangles, whose waves 1 and 4 may
 * overlap, and flats and triangles in the correction are not counted.
 *
 * Boundary: a public, non-house method under AGENTS.md's Strategy Modes
 * exception. It never feeds the scan, the score, a gate, GSPS's own plan or
 * an automated order.
 *
 * Three-question basis:
 * 1. Method source: Elliott, not the house method; deliberately separate.
 * 2. Cycles: Elliott's waves are a pattern of swings, not a fixed period, so
 *    Dewey's checklist doesn't apply; no time is projected.
 * 3. Hermetic: Rhythm, a trend's advance and correction in alternation.
 *    Law of Creation: impulse ⊗ correction is the cycle neither holds alone.
 */

import type { Bar } from "@/lib/types";
import { atr } from "./math";

export const ZIGZAG_ATR_MULT = 2;
const ATR_PERIOD = 14;

export interface SwingPoint {
  index: number;
  t: string;
  price: number;
  kind: "high" | "low";
  /** False for the latest extreme, which price hasn't yet turned away from. */
  confirmed: boolean;
}

export type WaveLabel = "0" | "1" | "2" | "3" | "4" | "5" | "A" | "B" | "C";

export interface WavePoint extends SwingPoint {
  label: WaveLabel;
}

export type WaveDirection = "bullish" | "bearish";

export interface ElliottImpulse {
  direction: WaveDirection;
  /** Wave starts and ends: labels 0 (start of wave 1) to 5. */
  points: WavePoint[];
  /** Guideline notes, plain words. */
  notes: string[];
}

export interface ElliottCorrection {
  /** Labels A, B and, once made, C. */
  points: WavePoint[];
  complete: boolean;
}

/** Waves 1 and 2 of a possible new five-wave move, wave 3 not yet begun. */
export interface ElliottWaveThreeSetup {
  direction: WaveDirection;
  /** Labels 0, 1, 2. */
  points: WavePoint[];
  /** How much of wave 1 wave 2 gave back, 0-1. */
  retrace: number;
}

export interface ElliottCount {
  pivots: SwingPoint[];
  impulse: ElliottImpulse | null;
  correction: ElliottCorrection | null;
  setup: ElliottWaveThreeSetup | null;
}

/** Wave 2 must give back at least this much of wave 1 to read as a wave 2 (engineering). */
export const MIN_WAVE_TWO_RETRACE = 0.236;

export function swingPoints(bars: Bar[], mult = ZIGZAG_ATR_MULT): SwingPoint[] {
  const a = atr(bars, ATR_PERIOD);
  const out: SwingPoint[] = [];
  let dir: 1 | -1 | 0 = 0;
  let hi = 0;
  let lo = 0;
  let ext = 0;
  const point = (i: number, kind: "high" | "low", confirmed: boolean): SwingPoint => ({
    index: i,
    t: bars[i].t,
    price: kind === "high" ? bars[i].h : bars[i].l,
    kind,
    confirmed,
  });
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!Number.isFinite(b.h) || !Number.isFinite(b.l)) continue;
    const thr = a[i];
    if (dir === 0) {
      if (b.h > bars[hi].h) hi = i;
      if (b.l < bars[lo].l) lo = i;
      if (thr == null) continue;
      if (b.h - bars[lo].l >= mult * thr && lo < i) {
        out.push(point(lo, "low", true));
        dir = 1;
        ext = i;
        for (let j = lo; j <= i; j++) if (bars[j].h > bars[ext].h) ext = j;
      } else if (bars[hi].h - b.l >= mult * thr && hi < i) {
        out.push(point(hi, "high", true));
        dir = -1;
        ext = i;
        for (let j = hi; j <= i; j++) if (bars[j].l < bars[ext].l) ext = j;
      }
      continue;
    }
    if (dir === 1) {
      if (b.h >= bars[ext].h) {
        ext = i;
      } else if (thr != null && bars[ext].h - b.l >= mult * thr) {
        out.push(point(ext, "high", true));
        dir = -1;
        ext = i;
      }
    } else {
      if (b.l <= bars[ext].l) {
        ext = i;
      } else if (thr != null && b.h - bars[ext].l >= mult * thr) {
        out.push(point(ext, "low", true));
        dir = 1;
        ext = i;
      }
    }
  }
  if (dir !== 0 && ext > (out.at(-1)?.index ?? -1)) {
    out.push(point(ext, dir === 1 ? "high" : "low", false));
  }
  return out;
}

function label(p: SwingPoint, l: WaveLabel): WavePoint {
  return { ...p, label: l };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** The five-wave rules on six alternating points; null when any rule fails. */
export function readImpulse(p: SwingPoint[]): ElliottImpulse | null {
  if (p.length !== 6) return null;
  const direction: WaveDirection = p[0].kind === "low" ? "bullish" : "bearish";
  const s = direction === "bullish" ? 1 : -1;
  for (let k = 0; k < 6; k++) {
    const want = (k % 2 === 0) === (direction === "bullish") ? "low" : "high";
    if (p[k].kind !== want) return null;
  }
  const x = p.map((q) => s * q.price);
  const w1 = x[1] - x[0];
  const w2 = x[1] - x[2];
  const w3 = x[3] - x[2];
  const w4 = x[3] - x[4];
  const w5 = x[5] - x[4];
  if (w1 <= 0 || w2 <= 0 || w3 <= 0 || w4 <= 0 || w5 <= 0) return null;
  if (x[2] <= x[0]) return null; // rule 1
  if (x[3] <= x[1]) return null; // wave 3 carries past wave 1
  if (w3 < w1 && w3 < w5) return null; // rule 2
  if (x[4] <= x[1]) return null; // rule 3

  const notes: string[] = [];
  const r2 = w2 / w1;
  notes.push(`Wave 2 gave back ${pct(r2)} of wave 1${r2 >= 0.5 && r2 <= 0.618 ? ", the common 50-62%" : ""}.`);
  const r3 = w3 / w1;
  notes.push(`Wave 3 ran ${r3.toFixed(2)} times wave 1${Math.abs(r3 - 1.618) <= 0.1 ? ", close to the common 1.618" : ""}.`);
  const r4 = w4 / w3;
  const deep2 = r2 >= 0.5;
  const deep4 = r4 >= 0.5;
  if (deep2 !== deep4) notes.push("Waves 2 and 4 alternate, one deep and one shallow.");
  if (x[5] < x[3]) notes.push("Wave 5 ended short of wave 3's end (a truncated fifth).");
  if (!p[5].confirmed) notes.push("Wave 5 may still be extending.");

  const labels: WaveLabel[] = ["0", "1", "2", "3", "4", "5"];
  return { direction, points: p.map((q, k) => label(q, labels[k])), notes };
}

function readCorrection(impulse: ElliottImpulse, after: SwingPoint[]): ElliottCorrection | null {
  const s = impulse.direction === "bullish" ? 1 : -1;
  const start = s * impulse.points[5].price;
  const [a, b, c] = after;
  if (!a || !b) return null;
  const xa = s * a.price;
  const xb = s * b.price;
  if (xa >= start || xb <= xa || xb >= start) return null;
  if (!c) return { points: [label(a, "A"), label(b, "B")], complete: false };
  const xc = s * c.price;
  if (xc >= xa) return { points: [label(a, "A"), label(b, "B")], complete: false };
  return { points: [label(a, "A"), label(b, "B"), label(c, "C")], complete: c.confirmed };
}

function readSetup(p: SwingPoint[]): ElliottWaveThreeSetup | null {
  // Waves 1 and 2 confirmed, the leg after wave 2 still under wave 1's end.
  const confirmed = p.filter((q) => q.confirmed);
  if (confirmed.length < 3) return null;
  const [q0, q1, q2] = confirmed.slice(-3);
  if (q0.kind === q1.kind || q1.kind === q2.kind) return null;
  const direction: WaveDirection = q0.kind === "low" ? "bullish" : "bearish";
  const s = direction === "bullish" ? 1 : -1;
  const w1 = s * (q1.price - q0.price);
  const w2 = s * (q1.price - q2.price);
  if (w1 <= 0 || w2 <= 0) return null;
  const retrace = w2 / w1;
  if (retrace >= 1 || retrace < MIN_WAVE_TWO_RETRACE) return null;
  const tail = p.at(-1);
  if (tail && !tail.confirmed && s * tail.price > s * q1.price) return null;
  return { direction, points: [label(q0, "0"), label(q1, "1"), label(q2, "2")], retrace };
}

/** The most recent count that keeps Elliott's rules, from completed bars. */
export function countElliott(bars: Bar[]): ElliottCount {
  const pivots = swingPoints(bars);
  let impulse: ElliottImpulse | null = null;
  let correction: ElliottCorrection | null = null;
  for (let j = pivots.length - 6; j >= 0; j--) {
    const found = readImpulse(pivots.slice(j, j + 6));
    if (!found) continue;
    impulse = found;
    correction = readCorrection(found, pivots.slice(j + 6, j + 9));
    break;
  }
  return { pivots, impulse, correction, setup: readSetup(pivots) };
}

/** Which way the count leans now, or null with no count. A wave 3 setup
 * leans its own way; after five waves the correction leans against them, and
 * once the A-B-C is complete the count leans the five waves' way again. */
export function elliottLean(count: ElliottCount): WaveDirection | null {
  if (count.setup) return count.setup.direction;
  const imp = count.impulse;
  if (!imp) return null;
  if (count.correction?.complete) return imp.direction;
  return imp.direction === "bullish" ? "bearish" : "bullish";
}

export interface DrawnWavePoint {
  index: number;
  t: string;
  price: number;
  kind: "high" | "low";
  /** The wave label, or two joined ("C/0") where one count ends at the next one's start. */
  text: string;
}

/** Every labelled point of the count, oldest first, for drawing. */
export function countPoints(count: ElliottCount): DrawnWavePoint[] {
  const byIndex = new Map<number, DrawnWavePoint>();
  const all = [...(count.impulse?.points ?? []), ...(count.correction?.points ?? []), ...(count.setup?.points ?? [])];
  for (const p of all) {
    const had = byIndex.get(p.index);
    if (had) {
      if (!had.text.split("/").includes(p.label)) had.text = `${had.text}/${p.label}`;
    } else {
      byIndex.set(p.index, { index: p.index, t: p.t, price: p.price, kind: p.kind, text: p.label });
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

export const ONE_VALID_COUNT = "One valid count; others are possible. Not a forecast.";
