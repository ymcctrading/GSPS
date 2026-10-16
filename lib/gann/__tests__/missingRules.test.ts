import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readSeasonalCount } from "@/lib/gann/seasonalCounts";
import { readAccumulation } from "@/lib/gann/accumulation";
import { readLeadership } from "@/lib/gann/leadership";
import { readSharesPerPoint } from "@/lib/gann/sharesPerPoint";
import { readDistributionBreakdown, readDistributionStanding, STANDING_SESSIONS } from "@/lib/gann/distribution";
import { applyDistributionBreakdownHold } from "@/lib/scoring/score";
import { readGannExit } from "@/lib/gann/exitRules";
import type { ScanDecision } from "@/lib/types";

function bars(closes: number[], vol: (i: number) => number = () => 1e6, start = "2025-01-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: vol(i) }));
}

describe("seasonal counts from March 21", () => {
  it("ranks the half year first and finds the midseason points", () => {
    expect(readSeasonalCount(new Date("2026-09-23T15:00:00Z"))?.point.label).toBe("½");
    expect(readSeasonalCount(new Date("2026-08-05T15:00:00Z"))?.point.rank).toBe(4);
    // Oct 15 became a point (9/16) when the plate's sixteenths were added on
    // 2026-09-30; Oct 2 sits between the ½ (Sep 22) and 9/16 (Oct 15).
    expect(readSeasonalCount(new Date("2026-10-02T15:00:00Z"))).toBeNull();
    expect(readSeasonalCount(new Date("2026-10-15T15:00:00Z"))?.point.label).toBe("9/16");
    expect(readSeasonalCount(new Date("2027-01-13T15:00:00Z"))?.point.rank).toBe(5);
  });
});

describe("accumulation time", () => {
  it("counts the weeks in a range and reads the breakout", () => {
    const flat = Array.from({ length: 90 }, (_, i) => 100 + (i % 4) - 1.5);
    // A close 3 points (price-scaled, ~5.1 at $102) beyond the range high.
    const r = readAccumulation(bars([...flat, 108]));
    expect(r?.breakout).toBe("up");
    expect(r!.weeks).toBeGreaterThanOrEqual(10);
    expect(r?.long).toBe(true);
  });
});

describe("leadership", () => {
  it("marks a stock that bottomed well before the market as an early leader", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => (i < 30 ? 100 - i : 70 + (i - 30) * 0.5)));
    const market = bars(Array.from({ length: 120 }, (_, i) => (i < 70 ? 400 - i : 330 + (i - 70) * 0.5)));
    const r = readLeadership(stock, market);
    expect(r?.bottomedFirst).toBe(true);
    expect(r?.bottomedLate).toBe(false);
  });

  it("works without the market series", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => 100 + i * 0.1));
    expect(readLeadership(stock, null)?.bottomedFirst).toBe(false);
  });
});

describe("shares per point", () => {
  it("returns a reading or null without throwing on a rising campaign", () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.4 + Math.sin(i / 4) * 3);
    const r = readSharesPerPoint(bars(closes, (i) => (i > 170 ? 5e6 : 1e6)));
    if (r) expect(r.ratio).toBeGreaterThan(0);
  });
});

/**
 * Weekly-chart sections (item 8 map FV11): a 10-day decline, then 12 days up
 * 1.0 and 9 days down 0.5, repeated, then a final 12-day up section. (These
 * were 6-up/3-down legs while the reading compared 3-day legs.)
 */
const SECTION = 12;
function steppingCampaign(cycles: number): number[] {
  const out: number[] = [];
  let p = 110;
  for (let i = 0; i < 10; i++) out.push((p -= 1));
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < SECTION; i++) out.push((p += 1));
    for (let i = 0; i < 9; i++) out.push((p -= 0.5));
  }
  for (let i = 0; i < SECTION; i++) out.push((p += 1));
  return out;
}

// W006 Volume Rule (campaign comparison, A-VOLUME-11): much more volume for
// fewer points near the high warns of a top. GSPS compares the current up
// leg with the prior one (sharesPerPoint.ts, TOP_WARNING_RATIO 1.7).
describe("shares per point: the top warning", () => {
  it("warns when the current up leg takes far more volume per point near the high", () => {
    const closes = steppingCampaign(8);
    const heavyFrom = closes.length - SECTION;
    const r = readSharesPerPoint(bars(closes, (i) => (i >= heavyFrom ? 5e6 : 1e6)))!;
    expect(r).not.toBeNull();
    expect(r.ratio).toBeGreaterThanOrEqual(1.8);
    expect(r.nearHigh).toBe(true);
    expect(r.topWarning).toBe(true);
  });

  it("warns on the 1937 figures: 151,197 shares a point against 88,860, 1.70 times (item 8 map FV11)", () => {
    const closes = steppingCampaign(8);
    const heavyFrom = closes.length - SECTION;
    const r = readSharesPerPoint(bars(closes, (i) => (i >= heavyFrom ? 1.7016e6 : 1e6)))!;
    expect(r.ratio).toBeCloseTo(151_197 / 88_860, 2);
    expect(r.nearHigh).toBe(true);
    expect(r.topWarning).toBe(true);
  });

  it("compares the weekly chart's up sections, not the 3-day legs inside them (item 8 map FV11)", () => {
    // A 20-day section up on light volume, a 10-day reaction, then a section
    // up in three legs (two 3-day dips) on twice the volume throughout.
    const closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 15; i++) closes.push((p -= 1));
    for (let i = 0; i < 20; i++) closes.push((p += 1));
    for (let i = 0; i < 10; i++) closes.push((p -= 1));
    const heavyFrom = closes.length;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 8; i++) closes.push((p += 1));
      if (k < 2) for (let i = 0; i < 3; i++) closes.push((p -= 0.5));
    }
    const r = readSharesPerPoint(bars(closes, (i) => (i >= heavyFrom ? 2e6 : 1e6)))!;
    expect(r).not.toBeNull();
    // Section against section: 2e6 a session over 21 points against 1e6 over 20.
    expect(r.ratio).toBeGreaterThan(2.5);
    expect(r.topWarning).toBe(true);
  });

  it("does not read the session still trading (item 8 review M3)", () => {
    const done = bars(steppingCampaign(8));
    const day = new Date(Date.parse(done[done.length - 1].t) + 86_400_000).toISOString().slice(0, 10);
    const last = done[done.length - 1];
    // Today's part session: heavy so far, and a point higher.
    const today: Bar = { ...last, t: `${day}T05:00:00Z`, c: last.c + 1, h: last.c + 1.5, v: 5e7 };
    const asOf = new Date(`${day}T15:00:00Z`);
    expect(readSharesPerPoint([...done, today], undefined, asOf)).toEqual(readSharesPerPoint(done, undefined, asOf));
    expect(readSharesPerPoint([...done, today])!.ratio).not.toBeCloseTo(readSharesPerPoint(done)!.ratio, 3);
  });

  it("does not warn when volume per point is unchanged", () => {
    const r = readSharesPerPoint(bars(steppingCampaign(8)))!;
    expect(r).not.toBeNull();
    expect(r.ratio).toBeLessThan(1.8);
    expect(r.topWarning).toBe(false);
  });
});

// W006 pp.27-29 / Stock Selector Ch. VII: early leaders in a bear market top
// first; late tops make late bottoms (A-SELECTION-03, A-TIME-08).
describe("leadership: topping first and bottoming late", () => {
  it("marks a stock whose high came 10+ days before the market's as toppedFirst", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => (i < 40 ? 100 + i : 140 - (i - 40) * 0.5)));
    const market = bars(Array.from({ length: 120 }, (_, i) => (i < 80 ? 300 + i : 380 - (i - 80) * 0.5)));
    const r = readLeadership(stock, market)!;
    expect(r.toppedFirst).toBe(true);
  });

  it("does not mark toppedFirst when the stock topped with the market", () => {
    const series = Array.from({ length: 120 }, (_, i) => (i < 80 ? 100 + i : 180 - (i - 80) * 0.5));
    expect(readLeadership(bars(series), bars(series.map((c) => c * 3)))!.toppedFirst).toBe(false);
  });

  it("marks a stock whose low came 10+ days after the market's as bottomedLate", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => (i < 70 ? 100 - i * 0.5 : 65 + (i - 70) * 0.5)));
    const market = bars(Array.from({ length: 120 }, (_, i) => (i < 30 ? 400 - i : 370 + (i - 30) * 0.5)));
    const r = readLeadership(stock, market)!;
    expect(r.bottomedLate).toBe(true);
    expect(r.bottomedFirst).toBe(false);
  });
});

// W006 pp.39-40, volume Rule 2: after a second, lower top, a dull narrow
// sideways spell broken downward on increased volume signals a further decline.
const barsUtc = bars;
describe("distribution: a narrow spell after a lower top, broken down on volume (A-VOLUME-03)", () => {
  /** Top 100, lower top 95, a 30-day spell near 82, then a break to `breakClose`. */
  function lowerTopThenSpell(secondTop: number, breakClose: number): number[] {
    const c: number[] = [];
    for (let i = 0; i <= 20; i++) c.push(70 + 1.5 * i); // to the first top, 100
    for (let i = 1; i <= 15; i++) c.push(100 - i); // to 85
    for (let i = 1; i <= 12; i++) c.push(85 + ((secondTop - 85) * i) / 12); // to the second top
    for (let i = 1; i <= 15; i++) c.push(secondTop - ((secondTop - 82) * i) / 15); // to 82
    for (let i = 0; i < 30; i++) c.push(82 + (i % 2 ? 0.5 : -0.5)); // the dull narrow spell
    c.push(breakClose);
    return c;
  }
  /**
   * Daily bars stamped at midnight New York time, as the data feed stamps them.
   * The sessions before the spell (the last run of 81.5/82.5 closes) trade at
   * least 2 million, so the spell is dull against them.
   */
  const bars = (closes: number[], vol: (i: number) => number) => {
    let start = closes.length - 1;
    while (start >= 0 && !(closes[start] === 81.5 || closes[start] === 82.5)) start--;
    while (start > 0 && (closes[start - 1] === 81.5 || closes[start - 1] === 82.5)) start--;
    return barsUtc(closes, (i) => (i < start ? Math.max(vol(i), 2e6) : vol(i))).map((x) => ({
      ...x,
      t: new Date(Date.parse(x.t) + 5 * 3_600_000).toISOString(),
    }));
  };
  const asOfAfter = (b: Bar[]) => new Date(Date.parse(b[b.length - 1].t) + 1.6 * 86_400_000);
  // The spell trades 1.0 and 1.5 million on alternate days (mean 1.25 million); the break trades 2.5 million.
  const heavyBreak = (n: number) => (i: number) => (i === n - 1 ? 2.5e6 : i % 2 ? 1.5e6 : 1e6);

  it("reads the break below the spell on above-average volume as a distribution breakdown", () => {
    const closes = lowerTopThenSpell(95, 74);
    const b = bars(closes, heavyBreak(closes.length));
    const r = readDistributionBreakdown(b, asOfAfter(b))!;
    expect(r.afterLowerTop).toBe(true);
    expect(r.brokeDown).toBe(true);
    expect(r.breakoutVolumeRatio).toBeCloseTo(2, 6);
    expect(r.distributionBreakdown).toBe(true);
  });

  it("does not on below-average volume", () => {
    const closes = lowerTopThenSpell(95, 74);
    const b = bars(closes, (i) => (i === closes.length - 1 ? 1.2e6 : i % 2 ? 1.5e6 : 1e6));
    const r = readDistributionBreakdown(b, asOfAfter(b))!;
    expect(r.brokeDown).toBe(true);
    expect(r.distributionBreakdown).toBe(false);
  });

  it("does not without the lower top", () => {
    const closes = lowerTopThenSpell(105, 74);
    const b = bars(closes, heavyBreak(closes.length));
    const r = readDistributionBreakdown(b, asOfAfter(b))!;
    expect(r.afterLowerTop).toBe(false);
    expect(r.brokeDown).toBe(true);
    expect(r.distributionBreakdown).toBe(false);
  });

  it("does not while the close is still inside the spell", () => {
    const closes = lowerTopThenSpell(95, 81);
    const b = bars(closes, heavyBreak(closes.length));
    const r = readDistributionBreakdown(b, asOfAfter(b))!;
    expect(r.afterLowerTop).toBe(true);
    expect(r.brokeDown).toBe(false);
    expect(r.distributionBreakdown).toBe(false);
  });

  it("puts the breakdown on the setup's card and counts it against a long and with a short", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const closes = lowerTopThenSpell(95, 74);
    const b = bars(closes, heavyBreak(closes.length));
    const ctx = readDisclosedRules(b, 74, null, asOfAfter(b));
    expect(ctx.distribution?.distributionBreakdown).toBe(true);
    expect(describeDisclosedRules(ctx)).toContain("After a lower top, the narrow range broke down on 2.0× its average volume: a sign of a further decline. A buy is held to Watch, and an open buy is closed, while price stays under the range, for up to 20 sessions after the break.");
    expect(contextFactorsFor(ctx, "bullish", 74)).toMatchObject({ distributionBreakdownAgainst: true, distributionBreakdownWith: false });
    expect(contextFactorsFor(ctx, "bearish", 74)).toMatchObject({ distributionBreakdownAgainst: false, distributionBreakdownWith: true });
    const quiet = readDisclosedRules(bars(closes, () => 1e6), 74, null, asOfAfter(b));
    expect(describeDisclosedRules(quiet).some((l) => l.startsWith("After a lower top"))).toBe(false);
  });

  it("reads the same on a year of history or six", () => {
    const closes = lowerTopThenSpell(95, 74);
    const yearOf = [...Array.from({ length: 260 }, (_, i) => 60 + 5 * Math.sin(i / 9)), ...closes];
    const longer = [...Array.from({ length: 1900 }, (_, i) => 40 + 15 * Math.sin(i / 23)), ...yearOf];
    const a = bars(yearOf.slice(-252), heavyBreak(252));
    const l = bars(longer, heavyBreak(longer.length));
    expect(a[a.length - 1].c).toBe(74);
    // Same last day on both: shift the shorter series onto the longer one's dates.
    const shifted = a.map((x, i) => ({ ...x, t: l[l.length - a.length + i].t }));
    expect(readDistributionBreakdown(shifted, asOfAfter(l))).toEqual(readDistributionBreakdown(l, asOfAfter(l)));
  });

  describe("acting on longs while the breakdown stands (FV7 b)", () => {
    const closes = lowerTopThenSpell(95, 74);
    /** The breakdown, then `after` closes, every session after the break on the spell's volume. */
    const withAfter = (after: number[]) => {
      const all = [...closes, ...after];
      return bars(all, (i) => (i === closes.length - 1 ? 2.5e6 : i % 2 ? 1.5e6 : 1e6));
    };
    const breakDate = (b: Bar[]) => b[closes.length - 1].t.slice(0, 10);

    it("stands after the session that printed it while price stays under the range", () => {
      const b = withAfter([75, 73, 76]);
      const r = readDistributionStanding(b, asOfAfter(b))!;
      expect(r.breakDate).toBe(breakDate(b));
      expect(r.rangeLow).toBeCloseTo(81, 6);
      expect(r.breakoutVolumeRatio).toBeCloseTo(2, 6);
    });

    it("ends once a close comes back into the spell", () => {
      expect(readDistributionStanding(withAfter([75, 80.9]), asOfAfter(withAfter([75, 80.9])))).not.toBeNull();
      const b = withAfter([75, 81]);
      expect(readDistributionStanding(b, asOfAfter(b))).toBeNull();
    });

    it("is looked for over the spell's length of sessions only", () => {
      const inside = withAfter(Array.from({ length: STANDING_SESSIONS - 1 }, () => 76));
      expect(readDistributionStanding(inside, asOfAfter(inside))).not.toBeNull();
      const older = withAfter(Array.from({ length: STANDING_SESSIONS }, () => 76));
      expect(readDistributionStanding(older, asOfAfter(older))).toBeNull();
    });

    it("needs the breakdown itself: no standing on a quiet break or without the lower top", () => {
      const quiet = bars([...closes, 75], (i) => (i === closes.length - 1 ? 1.2e6 : i % 2 ? 1.5e6 : 1e6));
      expect(readDistributionStanding(quiet, asOfAfter(quiet))).toBeNull();
      const higher = lowerTopThenSpell(105, 74);
      const h = bars([...higher, 75], (i) => (i === higher.length - 1 ? 2.5e6 : i % 2 ? 1.5e6 : 1e6));
      expect(readDistributionStanding(h, asOfAfter(h))).toBeNull();
    });

    it("does not read the break while its session is still trading", () => {
      const b = withAfter([]);
      expect(readDistributionStanding(b, new Date(Date.parse(b[b.length - 1].t) + 15 * 3_600_000))).toBeNull();
    });

    it("reads a breakdown 19 sessions old the same on the live scan's year of sessions or six years", () => {
      const tail = [...closes, ...Array.from({ length: STANDING_SESSIONS - 1 }, () => 76)];
      const yearOf = [...Array.from({ length: 260 }, (_, i) => 60 + 5 * Math.sin(i / 9)), ...tail];
      const longer = [...Array.from({ length: 1900 }, (_, i) => 40 + 15 * Math.sin(i / 23)), ...yearOf];
      const vol = (n: number) => (i: number) => (i === n - STANDING_SESSIONS ? 2.5e6 : i % 2 ? 1.5e6 : 1e6);
      const l = bars(longer, vol(longer.length));
      const a = bars(yearOf.slice(-250), vol(250)).map((x, i) => ({ ...x, t: l[l.length - 250 + i].t }));
      const r = readDistributionStanding(l, asOfAfter(l));
      expect(r).not.toBeNull();
      expect(readDistributionStanding(a, asOfAfter(l))).toEqual(r);
    });

    const execute = (): ScanDecision => ({ outputState: "Execute", breakdown: [] } as unknown as ScanDecision);

    it("holds a long Execute to Watch, and leaves a short and a Watch alone", () => {
      const b = withAfter([75]);
      const standing = readDistributionStanding(b, asOfAfter(b));
      const held = applyDistributionBreakdownHold(execute(), standing, "bullish");
      expect(held.outputState).toBe("Watch");
      expect(held.breakdown.at(-1)).toMatchObject({ key: "distributionBreakdown", passed: false });
      expect(applyDistributionBreakdownHold(execute(), standing, "bearish").outputState).toBe("Execute");
      expect(applyDistributionBreakdownHold(execute(), null, "bullish").outputState).toBe("Execute");
      const watch = { ...execute(), outputState: "Watch" } as ScanDecision;
      expect(applyDistributionBreakdownHold(watch, standing, "bullish")).toBe(watch);
    });

    it("exits a long while the breakdown stands, bought before it or after, and not a short", () => {
      const b = withAfter([75]);
      const entered = (k: number) => b[k].t.slice(0, 10);
      const pos = (entryDate: string, side: "long" | "short") => ({ side, entry: 82, initialStop: side === "long" ? 70 : 95, entryDate, crossedLevel: null });
      // Bought inside the spell, two sessions before the break.
      expect(readGannExit(pos(entered(closes.length - 3), "long"), b, null).exit).toMatchObject({ reason: "distribution" });
      // Bought on the session after the break: the breakdown still stands, so it exits too.
      expect(readGannExit(pos(entered(closes.length), "long"), b, null).exit).toMatchObject({ reason: "distribution" });
      expect(readGannExit(pos(entered(closes.length - 3), "short"), b, null).exit?.reason).not.toBe("distribution");
    });
  });

  it("does not out of a wide spell, or one no quieter than the sessions before it", () => {
    const closes = lowerTopThenSpell(95, 74);
    // The same spell, but swinging 76 to 88 (wider than twice the 3 points at
    // its low), broken to 66, past the wider range's own allowance.
    const wide = closes.map((c, i) => (i === closes.length - 1 ? 66 : i >= closes.length - 31 ? (i % 2 ? 88 : 76) : c));
    const w = barsUtc(wide, (i) => (i < closes.length - 31 ? 2e6 : heavyBreak(closes.length)(i))).map((x) => ({ ...x, t: new Date(Date.parse(x.t) + 5 * 3_600_000).toISOString() }));
    const rw = readDistributionBreakdown(w, asOfAfter(w))!;
    expect(rw).toMatchObject({ afterLowerTop: true, brokeDown: true, narrow: false, distributionBreakdown: false });
    // The narrow spell, on the same volume as the sessions before it.
    const loud = barsUtc(closes, heavyBreak(closes.length)).map((x) => ({ ...x, t: new Date(Date.parse(x.t) + 5 * 3_600_000).toISOString() }));
    const rl = readDistributionBreakdown(loud, asOfAfter(loud))!;
    expect(rl).toMatchObject({ narrow: true, dull: false, distributionBreakdown: false });
  });

  it("never reads the session still trading", () => {
    const closes = lowerTopThenSpell(95, 74);
    const b = bars(closes, heavyBreak(closes.length));
    // On the break's own day it is still trading, so the last completed session is inside the spell.
    const sameDay = new Date(Date.parse(b[b.length - 1].t) + 15 * 3_600_000);
    expect(readDistributionBreakdown(b, sameDay)!.brokeDown).toBe(false);
  });
});
