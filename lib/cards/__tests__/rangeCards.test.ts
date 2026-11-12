import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { pricePoint } from "@/lib/gann/pointScale";
import { activeFlags, activityMedians, atrPct, rangeBreakoutCard, rangeLowCard, RANGE_MIN_BARS } from "@/lib/cards/rangeCards";
import { rangeCardCalls } from "@/lib/cards/cardCalls";

const bar = (i: number, o: number, h: number, l: number, c: number, v = 1_000_000): Bar => ({
  t: new Date(Date.UTC(2025, 0, 1 + i, 5)).toISOString(),
  o,
  h,
  l,
  c,
  v,
});

/** 300 rising bars (no low is ever retested, no top crossed by a close), with a one-day spike to 200 at bar 150: the year's top. */
function rising(): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < 300; i++) {
    const c = 50 + 0.2 * i;
    out.push(bar(i, c - 0.1, i === 150 ? 200 : c + 0.5, c - 0.5, c));
  }
  return out;
}

/** Then 30 bars falling to a low of 90 at bar 329 (each a new low), then rising lows that never come within a point of it. */
function rangeLowSeries(tonight: { l: number; c: number }): Bar[] {
  const out = rising();
  for (let i = 300; i < 330; i++) {
    const c = 109 - (i - 300) * 0.62;
    out.push(bar(i, c + 0.2, c + 0.6, i === 329 ? 90 : c - 0.6, c));
  }
  for (let i = 330; i < 339; i++) out.push(bar(i, 93, 94, 92 + (i - 330) * 0.1, 93.5));
  out.push(bar(339, 93, 93.5, tonight.l, tonight.c));
  return out;
}

const all = (n: number) => new Array<boolean>(n).fill(true);

describe("atrPct and the activity line", () => {
  it("is the 20-session mean true range over the close, NaN before 20 bars", () => {
    const bars = Array.from({ length: 25 }, (_, i) => bar(i, 100, 102, 98, 100));
    const a = atrPct(bars);
    expect(a[18]).toBeNaN();
    expect(a[19]).toBeCloseTo(0.04, 10);
    expect(a[24]).toBeCloseTo(0.04, 10);
  });

  it("takes each day's median across the stocks read, and marks a stock active at or above it", () => {
    const calm = Array.from({ length: 21 }, (_, i) => bar(i, 100, 101, 99, 100));
    const mid = Array.from({ length: 21 }, (_, i) => bar(i, 100, 102, 98, 100));
    const wild = Array.from({ length: 21 }, (_, i) => bar(i, 100, 105, 95, 100));
    const med = activityMedians([calm, mid, wild]);
    expect(med.get(calm[20].t)).toBeCloseTo(0.04, 10);
    expect(activeFlags(mid, med)[20]).toBe(true);
    expect(activeFlags(calm, med)[20]).toBe(false);
    expect(activeFlags(wild, med)[20]).toBe(true);
    expect(activeFlags(wild, med)[5]).toBe(false); // no value yet: not active
  });
});

describe("rangeLowCard", () => {
  it("issues the 1st held test of the 20-session low: buy at the open, stop 3 points under, TP1 the range top, MTP the year's top", () => {
    const bars = rangeLowSeries({ l: 90.5, c: 93 });
    const card = rangeLowCard(bars, all(bars.length));
    const top = Math.max(...bars.slice(319, 339).map((b) => b.h));
    expect(card).toEqual({
      kind: "rangeLow",
      entry: 93,
      stop: 90 - 3 * pricePoint(90),
      tp1: top,
      mtp: 200,
      eventIndex: 339,
      test: 1,
    });
  });

  it("needs the low held: within a point of it, the close back at or above it", () => {
    expect(rangeLowCard(rangeLowSeries({ l: 92, c: 93 }), all(340))).toBeNull(); // more than a point away
    expect(rangeLowCard(rangeLowSeries({ l: 89.5, c: 89.8 }), all(340))).toBeNull(); // closed under the low
  });

  it("gives no card on an inactive stock, on a short history, or while an earlier test's trade still runs", () => {
    const bars = rangeLowSeries({ l: 90.5, c: 93 });
    const quiet = all(bars.length);
    quiet[339] = false;
    expect(rangeLowCard(bars, quiet)).toBeNull();
    expect(rangeLowCard(bars.slice(bars.length - RANGE_MIN_BARS + 1), all(RANGE_MIN_BARS - 1))).toBeNull();
    // A held test at bar 333 opens a trade at 334's open that neither stops nor reaches TP1 by tonight.
    const busy = rangeLowSeries({ l: 90.5, c: 93 });
    busy[333] = { ...busy[333], l: 90.8, c: 92 };
    expect(rangeLowCard(busy, all(busy.length))).toBeNull();
  });

  it("reads only the bars it is given: tonight's card does not change when later bars exist elsewhere", () => {
    const bars = rangeLowSeries({ l: 90.5, c: 93 });
    const later = [...bars, bar(340, 93, 99, 92, 98)];
    expect(rangeLowCard(later.slice(0, 340), all(340))).toEqual(rangeLowCard(bars, all(340)));
  });
});

/** The rising bars, then a 39-bar flat range under 101, then tonight's close over the top. */
function breakoutSeries(after: Bar[] = []): Bar[] {
  const out = rising();
  for (let i = 300; i < 339; i++) out.push(bar(i, 100, 101, 99, 100));
  out.push(bar(339, 100, 104.5, 99.5, 104));
  return [...out, ...after];
}

describe("rangeBreakoutCard", () => {
  const top = 101;
  const pt = pricePoint(top);
  const line = top + pt;
  const stop = top - 3 * pt;

  it("on the first close a point over the range top: a buy limit at that line, stop 3 points under the old top", () => {
    const bars = breakoutSeries();
    const card = rangeBreakoutCard(bars, all(bars.length));
    // TP1: the nearest earlier 5-bar swing top above entry + 1R (bar 299's 110.3), not the year's spike.
    expect(card).toEqual({ kind: "rangeBreakout", entry: line, stop, tp1: bars[299].h, mtp: 200, eventIndex: 339 });
    expect(bars[299].h).toBeGreaterThan(line + (line - stop));
  });

  it("stays on offer while the reaction has not come, inside its 10 sessions", () => {
    const bars = breakoutSeries([bar(340, 105, 106, 104, 105.5)]);
    expect(rangeBreakoutCard(bars, all(bars.length))).toMatchObject({ entry: line, eventIndex: 339 });
    const long = breakoutSeries(Array.from({ length: 10 }, (_, k) => bar(340 + k, 105, 106, 104, 105.5)));
    expect(rangeBreakoutCard(long, all(long.length))).toBeNull(); // the window has passed
  });

  it("gives no card once it has filled and the trade runs, after a close under the stop, or on an inactive day", () => {
    const filled = breakoutSeries([bar(340, 104, 104.5, line - 0.1, 103.5)]);
    expect(rangeBreakoutCard(filled, all(filled.length))).toBeNull();
    const failed = breakoutSeries([bar(340, 104, 104.5, 103, stop - 0.5)]);
    expect(rangeBreakoutCard(failed, all(failed.length))).toBeNull();
    const bars = breakoutSeries();
    const quiet = all(bars.length);
    quiet[339] = false;
    expect(rangeBreakoutCard(bars, quiet)).toBeNull();
  });
});

describe("rangeCardCalls", () => {
  it("records each card on the stock's last close, with its MTP and the signal close", () => {
    const low = rangeLowSeries({ l: 90.5, c: 93 });
    const brk = breakoutSeries();
    // A calm stock on the same days: the two others are active against the median with it.
    const calm = low.map((x) => ({ ...x, o: 100, h: 100.05, l: 99.95, c: 100 }));
    const calls = rangeCardCalls(new Map([["LLL", low], ["BBB", brk], ["CALM", calm]]), "2025-12-06");
    expect(new Date(low[339].t).toISOString().slice(0, 10)).toBe("2025-12-06");
    expect(calls.map((c) => [c.symbol, c.kind]).sort()).toEqual([["BBB", "rangeBreakout"], ["LLL", "rangeLow"]]);
    for (const c of calls) {
      expect(c.signalDate).toBe("2025-12-06");
      expect(c.stop).toBeLessThan(c.tp1);
    }
    expect(calls.find((c) => c.symbol === "LLL")).toMatchObject({ entry: 93, mtp: 200, signalClose: 93 });
  });

  it("skips a stock whose last bar is not the night's", () => {
    const low = rangeLowSeries({ l: 90.5, c: 93 });
    expect(rangeCardCalls(new Map([["LLL", low]]), "2025-12-07")).toEqual([]);
  });
});
