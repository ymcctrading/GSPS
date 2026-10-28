/**
 * Live lesson examples from the learner's own charts (owner, 2026-10-28):
 * "when the example for a bear market comes up, we can take the most recent
 * bear run" from one of the learner's picks, so the lesson is always current.
 *
 * Each finder reads completed daily bars and returns the most recent stretch
 * that shows its idea, in the public, textbook form the lessons teach (Dow
 * theory's higher highs and higher lows, the 20% bear market, the breakout
 * from a trading range, the halfway pullback, volume at a turn, Elliott's
 * waves). Every caption is plain words. Nothing here is a forecast, and every
 * example is labelled "a past move".
 *
 * Engineering choices, labelled: the swing points are the Elliott counter's
 * zigzag (2× the 14-bar ATR), so every example and the Elliott overlay agree
 * on what a swing is; 20% for a bear or bull market and 10-20% for a
 * correction are the common market conventions; the trading range is 20 bars
 * no wider than 12% of price; a halfway pullback gives back 40-60% of the
 * swing; heavy volume is twice the 50-bar average.
 *
 * Three-question basis: 1. Method: public methods by name, as the owner's
 * 2026-10-28 rule requires for anything a learner reads. 2. Cycles: no period
 * is claimed; each finder reads one past move. 3. Hermetic: Correspondence,
 * the lesson's idea found on the learner's own chart.
 */

import type { Bar } from "@/lib/types";
import { countElliott, swingPoints, type SwingPoint } from "@/lib/strategies/elliottCount";

export type ExampleKind =
  | "uptrend"
  | "downtrend"
  | "bull_market"
  | "bear_market"
  | "correction"
  | "trading_range_breakout"
  | "halfway_pullback"
  | "volume_at_turn"
  | "elliott_five_waves"
  | "elliott_abc";

export const EXAMPLE_TITLES: Record<ExampleKind, string> = {
  uptrend: "An uptrend: higher highs and higher lows",
  downtrend: "A downtrend: lower highs and lower lows",
  bull_market: "A bull market: a rise of 20% or more",
  bear_market: "A bear market: a fall of 20% or more",
  correction: "A correction: a fall of 10% to 20%",
  trading_range_breakout: "A breakout from a trading range",
  halfway_pullback: "A pullback to about halfway",
  volume_at_turn: "Heavy volume at a turn",
  elliott_five_waves: "Elliott Wave: five waves",
  elliott_abc: "Elliott Wave: an A-B-C correction",
};

export interface ExamplePoint {
  t: string;
  price: number;
  text: string;
  position: "above" | "below";
}

export interface ExampleMatch {
  kind: ExampleKind;
  /** First and last bar of the stretch to draw (inclusive), as indexes into the bars searched. */
  start: number;
  end: number;
  caption: string;
  points: ExamplePoint[];
  lines: { price: number; label: string }[];
}

export const BEAR_MARKET_PCT = 0.2;
export const CORRECTION_PCT = 0.1;
export const RANGE_BARS = 20;
export const RANGE_MAX_WIDTH = 0.12;
export const HEAVY_VOLUME = 2;

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const money = (n: number) => `$${fmt(n)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const date = (t: string) => t.slice(0, 10);

function swingPoint(p: SwingPoint, text: string): ExamplePoint {
  return { t: p.t, price: p.price, text, position: p.kind === "high" ? "above" : "below" };
}

/** Two higher highs and two higher lows in a row (Dow theory); the mirror for a downtrend. */
function findTrend(bars: Bar[], up: boolean): ExampleMatch | null {
  const sw = swingPoints(bars).filter((p) => p.confirmed);
  for (let j = sw.length - 4; j >= 0; j--) {
    const run = sw.slice(j, j + 4);
    const highs = run.filter((p) => p.kind === "high");
    const lows = run.filter((p) => p.kind === "low");
    if (highs.length !== 2 || lows.length !== 2) continue;
    const ok = up
      ? highs[1].price > highs[0].price && lows[1].price > lows[0].price
      : highs[1].price < highs[0].price && lows[1].price < lows[0].price;
    if (!ok) continue;
    const word = up ? "higher" : "lower";
    return {
      kind: up ? "uptrend" : "downtrend",
      start: Math.max(0, run[0].index - 5),
      end: Math.min(bars.length - 1, run[3].index + 5),
      caption: `From ${date(run[0].t)} to ${date(run[3].t)} each swing high was ${word} than the one before, and each swing low was ${word} too.`,
      points: run.map((p) => swingPoint(p, p.kind === "high" ? `${word} high` : `${word} low`)),
      lines: [],
    };
  }
  return null;
}

/** The trough after `from`: the lowest close before price closes back beyond `from`'s close. */
function extremeAfter(bars: Bar[], from: number, down: boolean): number {
  const c = bars[from].c;
  let ext = from;
  for (let k = from + 1; k < bars.length; k++) {
    if (down ? bars[k].c > c : bars[k].c < c) break;
    if (down ? bars[k].c < bars[ext].c : bars[k].c > bars[ext].c) ext = k;
  }
  return ext;
}

/** The start of the move into `to`: the highest close (lowest, for a rise) since price was last at or beyond `to`'s close. */
function startBefore(bars: Bar[], to: number, down: boolean): number {
  const c = bars[to].c;
  let ext = to;
  for (let k = to - 1; k >= 0; k--) {
    if (down ? bars[k].c <= c : bars[k].c >= c) break;
    if (down ? bars[k].c > bars[ext].c : bars[k].c < bars[ext].c) ext = k;
  }
  return ext;
}

/**
 * The most recent close-to-close fall (or rise) of at least `minPct`, and
 * under `maxPct` when given, measured from the move's true start (the highest
 * close since price was last as low as the trough) to its trough.
 */
function findSwingOf(bars: Bar[], down: boolean, minPct: number, maxPct: number | null): { from: number; to: number; move: number } | null {
  for (let i = bars.length - 2; i >= 0; i--) {
    if (!(bars[i].c > 0)) continue;
    const to0 = extremeAfter(bars, i, down);
    if (to0 === i || Math.abs(bars[to0].c - bars[i].c) / bars[i].c < minPct) continue;
    const from = startBefore(bars, to0, down);
    const to = extremeAfter(bars, from, down);
    const move = Math.abs(bars[to].c - bars[from].c) / bars[from].c;
    if (move < minPct) continue;
    if (maxPct !== null && move >= maxPct) {
      i = from;
      continue;
    }
    return { from, to, move };
  }
  return null;
}

function findBigMove(bars: Bar[], kind: "bull_market" | "bear_market" | "correction"): ExampleMatch | null {
  const down = kind !== "bull_market";
  const hit =
    kind === "correction"
      ? findSwingOf(bars, true, CORRECTION_PCT, BEAR_MARKET_PCT)
      : findSwingOf(bars, down, BEAR_MARKET_PCT, null);
  if (!hit) return null;
  const a = bars[hit.from];
  const b = bars[hit.to];
  const verb = down ? "fell" : "rose";
  const lead =
    kind === "bear_market" ? "A bear market" : kind === "bull_market" ? "A bull market" : "A correction";
  return {
    kind,
    start: Math.max(0, hit.from - 10),
    end: Math.min(bars.length - 1, hit.to + 10),
    caption: `${lead}: the close ${verb} ${pct(hit.move)}, from ${money(a.c)} on ${date(a.t)} to ${money(b.c)} on ${date(b.t)}.`,
    points: [
      { t: a.t, price: a.c, text: down ? "peak" : "low", position: down ? "above" : "below" },
      { t: b.t, price: b.c, text: down ? "low" : "peak", position: down ? "below" : "above" },
    ],
    lines: [],
  };
}

/** 20 bars held within 12% of price, then a close beyond the range. */
function findRangeBreakout(bars: Bar[]): ExampleMatch | null {
  for (let i = bars.length - 1; i > RANGE_BARS; i--) {
    const range = bars.slice(i - RANGE_BARS, i);
    const hi = Math.max(...range.map((b) => b.h));
    const lo = Math.min(...range.map((b) => b.l));
    if (!(lo > 0) || (hi - lo) / lo > RANGE_MAX_WIDTH) continue;
    const c = bars[i].c;
    const up = c > hi;
    if (!up && !(c < lo)) continue;
    return {
      kind: "trading_range_breakout",
      start: Math.max(0, i - RANGE_BARS - 5),
      end: Math.min(bars.length - 1, i + 15),
      caption: `For ${RANGE_BARS} sessions price held between ${money(lo)} and ${money(hi)}. On ${date(bars[i].t)} it closed ${up ? "above the top" : "below the bottom"} of that range at ${money(c)}.`,
      points: [{ t: bars[i].t, price: c, text: up ? "breakout" : "breakdown", position: up ? "above" : "below" }],
      lines: [
        { price: hi, label: "range top" },
        { price: lo, label: "range bottom" },
      ],
    };
  }
  return null;
}

/** A swing whose next pullback gave back 40-60% of it. */
function findHalfway(bars: Bar[]): ExampleMatch | null {
  const sw = swingPoints(bars).filter((p) => p.confirmed);
  for (let j = sw.length - 3; j >= 0; j--) {
    const [a, b, c] = sw.slice(j, j + 3);
    const size = Math.abs(b.price - a.price);
    if (!(size > 0)) continue;
    const back = Math.abs(b.price - c.price) / size;
    if (back < 0.4 || back > 0.6) continue;
    const half = (a.price + b.price) / 2;
    const up = b.price > a.price;
    return {
      kind: "halfway_pullback",
      start: Math.max(0, a.index - 5),
      end: Math.min(bars.length - 1, c.index + 10),
      caption: `The ${up ? "rise" : "fall"} from ${money(a.price)} to ${money(b.price)} was followed by a pullback that gave back ${pct(back)} of it, turning near the halfway point (${money(half)}).`,
      points: [swingPoint(a, "start"), swingPoint(b, up ? "high" : "low"), swingPoint(c, "pullback")],
      lines: [{ price: half, label: "halfway" }],
    };
  }
  return null;
}

/** A swing turn whose bar traded at least twice the 50-bar average volume. */
function findVolumeTurn(bars: Bar[]): ExampleMatch | null {
  const sw = swingPoints(bars).filter((p) => p.confirmed);
  for (let j = sw.length - 1; j >= 0; j--) {
    const p = sw[j];
    if (p.index < 50) break;
    const win = bars.slice(p.index - 50, p.index);
    const avg = win.reduce((s, b) => s + (b.v || 0), 0) / win.length;
    const v = bars[p.index].v || 0;
    if (!(avg > 0) || v < HEAVY_VOLUME * avg) continue;
    return {
      kind: "volume_at_turn",
      start: Math.max(0, p.index - 30),
      end: Math.min(bars.length - 1, p.index + 20),
      caption: `On ${date(p.t)} price made a swing ${p.kind} on ${(v / avg).toFixed(1)} times its usual volume, and then turned.`,
      points: [swingPoint(p, `swing ${p.kind}, heavy volume`)],
      lines: [],
    };
  }
  return null;
}

function findElliott(bars: Bar[], kind: "elliott_five_waves" | "elliott_abc"): ExampleMatch | null {
  const count = countElliott(bars);
  const imp = count.impulse;
  if (!imp) return null;
  if (kind === "elliott_abc" && !count.correction?.complete) return null;
  const pts = kind === "elliott_five_waves" ? imp.points : [imp.points[5], ...(count.correction?.points ?? [])];
  const first = pts[0];
  const last = pts[pts.length - 1];
  const rising = imp.direction === "bullish";
  const caption =
    kind === "elliott_five_waves"
      ? `Five ${rising ? "rising" : "falling"} waves from ${date(first.t)} to ${date(last.t)} that keep Elliott's rules: wave 2 stayed above the start of wave 1, wave 3 wasn't the shortest, and wave 4 stayed out of wave 1's range. ${imp.notes.join(" ")}`
      : `After five ${rising ? "rising" : "falling"} waves, a three-wave A-B-C correction ran from ${date(first.t)} to ${date(last.t)}.`;
  return {
    kind,
    start: Math.max(0, first.index - 5),
    end: Math.min(bars.length - 1, last.index + 5),
    caption: `${caption} One valid count; others are possible.`,
    points: pts.map((p) => ({ t: p.t, price: p.price, text: p.label === "0" ? "start" : p.label, position: p.kind === "high" ? "above" : "below" })),
    lines: [],
  };
}

export function findExample(bars: Bar[], kind: ExampleKind): ExampleMatch | null {
  if (bars.length < 30) return null;
  switch (kind) {
    case "uptrend":
      return findTrend(bars, true);
    case "downtrend":
      return findTrend(bars, false);
    case "bull_market":
    case "bear_market":
    case "correction":
      return findBigMove(bars, kind);
    case "trading_range_breakout":
      return findRangeBreakout(bars);
    case "halfway_pullback":
      return findHalfway(bars);
    case "volume_at_turn":
      return findVolumeTurn(bars);
    case "elliott_five_waves":
    case "elliott_abc":
      return findElliott(bars, kind);
  }
}

export interface ChosenExample {
  symbol: string;
  /** True when none of the learner's picks had one and the broad market stood in. */
  standIn: boolean;
  match: ExampleMatch;
  /** The bars of the stretch drawn, oldest first. */
  bars: Bar[];
}

/**
 * The most recent example of `kind` across the learner's markets (the one
 * that ended latest; ties go to the earlier pick), or the stand-in market's
 * when none of theirs has one.
 */
export function chooseExample(
  kind: ExampleKind,
  barsBySymbol: ReadonlyMap<string, Bar[]>,
  picks: readonly string[],
  standIn: { symbol: string; bars: Bar[] } | null,
): ChosenExample | null {
  let best: ChosenExample | null = null;
  for (const symbol of picks) {
    const bars = barsBySymbol.get(symbol);
    if (!bars) continue;
    const match = findExample(bars, kind);
    if (!match) continue;
    if (!best || bars[match.end].t > best.bars[best.bars.length - 1].t) {
      best = { symbol, standIn: false, match, bars: bars.slice(match.start, match.end + 1) };
    }
  }
  if (best) return best;
  if (!standIn) return null;
  const match = findExample(standIn.bars, kind);
  if (!match) return null;
  return { symbol: standIn.symbol, standIn: true, match, bars: standIn.bars.slice(match.start, match.end + 1) };
}
