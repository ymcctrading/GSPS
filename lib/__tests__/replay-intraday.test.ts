import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { INTRADAY_WINDOW_BARS, MIN_POINT_PCT, intradayPoint, replayIntraday } from "@/lib/backtest/replayIntraday";
import { byOutputState, combine } from "@/lib/backtest/replay";

/**
 * The intraday profile (`lib/backtest/replayIntraday.ts`). These are structural
 * tests on synthetic bars: a zig-zag whose legs run `[bars, % change]`, so the
 * 3-bar swing chart completes real swings. They say the rules are wired and
 * mirror-symmetric, that nothing reads the future, and that a stop is honoured.
 * They say nothing about whether the profile has an edge; that needs the run
 * pre-registered in docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md Part 5.
 */

const BARS_PER_DAY = 26;
const AT = (day: number, n: number) => {
  const d = new Date(Date.UTC(2026, 5, 1 + day)).toISOString().slice(0, 10);
  const mins = 13 * 60 + 30 + n * 15;
  return `${d}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00Z`;
};

/** 15-minute bars walking `legs` end to end, starting at `start`. */
function zigzag(days: number, legs: [number, number][], start = 100, firstDay = 0): Bar[] {
  const out: Bar[] = [];
  let price = start;
  let leg = 0;
  let inLeg = 0;
  for (let d = 0; d < days; d++) {
    for (let n = 0; n < BARS_PER_DAY; n++) {
      const [len, pct] = legs[leg % legs.length];
      const o = price;
      const c = o * (1 + pct / len / 100);
      out.push({ t: AT(firstDay + d, n), o, h: Math.max(o, c) * 1.0002, l: Math.min(o, c) * 0.9998, c, v: 100_000 });
      price = c;
      if (++inLeg >= len) {
        inLeg = 0;
        leg++;
      }
    }
  }
  return out;
}

/** A calm daily history ahead of the bars, then the bars' own days. */
function dailyFor(bars: Bar[]): Bar[] {
  const before: Bar[] = Array.from({ length: 30 }, (_, i) => ({
    t: `2026-04-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    o: 95,
    h: 97,
    l: 93.5,
    c: 95.5 + i * 0.1,
    v: 5_000_000,
  }));
  const byDay = new Map<string, Bar[]>();
  for (const b of bars) byDay.set(b.t.slice(0, 10), [...(byDay.get(b.t.slice(0, 10)) ?? []), b]);
  const own = [...byDay].map(([d, bs]) => ({
    t: `${d}T00:00:00Z`,
    o: bs[0].o,
    h: Math.max(...bs.map((b) => b.h)),
    l: Math.min(...bs.map((b) => b.l)),
    c: bs[bs.length - 1].c,
    v: 5_000_000,
  }));
  return [...before, ...own];
}

const UP: [number, number][] = [
  [10, 1.2],
  [5, -0.55],
];
const DOWN: [number, number][] = [
  [10, -1.2],
  [5, 0.55],
];

const run = (bars: Bar[], extra: Partial<Parameters<typeof replayIntraday>[2]> = {}) =>
  replayIntraday("TEST", bars, { dailyBars: dailyFor(bars), ...extra });

/** An uptrend, then a sharp turn down, so the position meets its trailing stop. */
function upThenReversal(): Bar[] {
  const up = zigzag(6, UP);
  const last = up[up.length - 1].c;
  const down = zigzag(8, [
    [12, -2.2],
    [6, 0.8],
  ], last, 6);
  return [...up, ...down];
}

describe("intradayPoint", () => {
  it("is a third of Gann's price-scaled 3 points, in proportion to how large these bars' swings are against a day's", () => {
    const quarter = intradayPoint(100, 0.5, 2);
    expect(quarter).toBeCloseTo((gannThreePoints(100) / 3) * 0.25, 10);
    expect(intradayPoint(100, 1, 2)).toBeCloseTo(2 * quarter, 10);
  });

  it("never exceeds the daily third, and is floored so a quiet name still gets an allowance", () => {
    expect(intradayPoint(100, 9, 2)).toBeCloseTo(gannThreePoints(100) / 3, 10);
    expect(intradayPoint(100, 0.0001, 2)).toBeCloseTo((100 * MIN_POINT_PCT) / 100, 10);
  });

  it("is zero when either ATR is unknown", () => {
    expect(intradayPoint(100, 0, 2)).toBe(0);
    expect(intradayPoint(100, 0.5, 0)).toBe(0);
    expect(intradayPoint(0, 0.5, 2)).toBe(0);
  });
});

describe("replayIntraday", () => {
  it("takes a long with the trend, confirmed, with a stop below its entry and an unscored verdict", () => {
    const r = run(zigzag(12, UP));
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.direction).toBe("bullish");
      expect(t.setupKind).toBe("continuation");
      expect(t.stop).toBeLessThan(t.entry);
      expect(Number.isFinite(t.rMultiple)).toBe(true);
      expect(t.exitReason).toBeDefined();
      expect(t.outputState).toBeUndefined();
      expect(t.score).toBeUndefined();
      expect(t.pattern).toBeNull();
    }
    expect(r.triggered).toBe(r.trades.length + r.refusedFills);
    // Every trade is unscored, so it lands in the unscored bucket and nowhere else.
    expect(byOutputState(r).unscored.trades).toHaveLength(r.trades.length);
    expect(byOutputState(r).Execute.trades).toHaveLength(0);
  });

  it("mirrors for a short (Polarity)", () => {
    const r = run(zigzag(12, DOWN));
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.direction).toBe("bearish");
      expect(t.stop).toBeGreaterThan(t.entry);
    }
  });

  it("takes nothing in a market that goes nowhere", () => {
    const r = run(
      zigzag(12, [
        [10, 0.3],
        [10, -0.3],
      ]),
    );
    expect(r.trades).toHaveLength(0);
    expect(r.triggered).toBe(0);
  });

  it("holds one position at a time, so a plan that confirms while one is open does not double up", () => {
    const r = run(zigzag(12, UP));
    const sorted = [...r.trades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = Date.parse(sorted[i - 1].openedAt) + sorted[i - 1].barsHeld * 15 * 60_000;
      expect(Date.parse(sorted[i].openedAt)).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("trails the stop under the swings and leaves on it when the market turns", () => {
    const r = run(upThenReversal());
    const first = r.trades[0];
    expect(first.direction).toBe("bullish");
    expect(first.exitReason).toBe("intraday_trailing_stop");
    // The stop moved up past the entry's own protective stop, so the exit locks in gain.
    expect(first.rMultiple).toBeGreaterThan(0);
    // The crash broke the stops of the plans armed on the way down.
    expect(r.retiredPlans).toBeGreaterThan(0);
  });

  it("never reads past the candle it decides on: changing the bars after a trade has left changes nothing before", () => {
    const bars = upThenReversal();
    const base = run(bars);
    const first = base.trades[0];
    const exitIndex = bars.findIndex((b) => b.t === first.openedAt) + first.barsHeld;
    const perturbed = bars.map((b, i) =>
      i <= exitIndex ? b : { ...b, o: b.o * 1.7, h: b.h * 2.1, l: b.l * 0.4, c: b.c * 0.6 },
    );
    const again = run(perturbed, { dailyBars: dailyFor(bars) });
    expect(again.trades[0]).toEqual(first);
  });

  it("carries a different reclaim allowance only when asked, and the default is the live one", () => {
    const bars = upThenReversal();
    const live = run(bars);
    expect(run(bars, { reclaimPoints: 3 }).trades).toEqual(live.trades);
    const strict = run(bars, { reclaimPoints: 5 });
    // Stricter can only keep plans out longer, never admit more of them.
    expect(strict.trades.length).toBeLessThanOrEqual(live.trades.length);
  });

  it("adds up across symbols like every other replay", () => {
    const a = run(zigzag(12, UP));
    const b = run(zigzag(12, DOWN));
    expect(combine([a, b]).trades).toHaveLength(a.trades.length + b.trades.length);
  });

  it("bounds the history it reads per bar", () => {
    expect(INTRADAY_WINDOW_BARS).toBe(400);
  });
});
