import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readSeasonalCount } from "@/lib/gann/seasonalCounts";
import { readAccumulation } from "@/lib/gann/accumulation";
import { readLeadership } from "@/lib/gann/leadership";
import { readSharesPerPoint } from "@/lib/gann/sharesPerPoint";

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
    const r = readAccumulation(bars([...flat, 106]));
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

/** 6 bars up 1.0, 3 bars down 0.5, repeated, then a final 6-bar up leg. */
function steppingCampaign(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  for (let i = 0; i < 6; i++) out.push((p += 1));
  return out;
}

// W006 Volume Rule (campaign comparison, A-VOLUME-11): much more volume for
// fewer points near the high warns of a top. GSPS compares the current up
// leg with the prior one (sharesPerPoint.ts, TOP_WARNING_RATIO 1.8).
describe("shares per point: the top warning", () => {
  it("warns when the current up leg takes far more volume per point near the high", () => {
    const closes = steppingCampaign(8);
    const heavyFrom = closes.length - 6;
    const r = readSharesPerPoint(bars(closes, (i) => (i >= heavyFrom ? 5e6 : 1e6)))!;
    expect(r).not.toBeNull();
    expect(r.ratio).toBeGreaterThanOrEqual(1.8);
    expect(r.nearHigh).toBe(true);
    expect(r.topWarning).toBe(true);
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
