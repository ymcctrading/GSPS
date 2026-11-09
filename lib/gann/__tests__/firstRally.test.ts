/**
 * A-TIME-03 (New Stock Trend Detector, 1936, pp. 14, 43): the 1932 advance
 * out of the bear market could not go higher in its third month and the
 * volume was large, so it was only a first rally; after a bear market whose
 * rallies never lasted over two months, a real bull market has to rise three
 * full months or more. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readFirstRally } from "@/lib/gann/firstRally";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

/** One bar a month from January 2000, from [high, low, volume] triples. */
function months(rows: [number, number, number][]): Bar[] {
  return rows.map(([h, l, v], i) => {
    const d = new Date(Date.UTC(2000, i, 1, 5));
    return { t: d.toISOString(), o: (h + l) / 2, h, l, c: (h + l) / 2, v };
  });
}

// A bear market down to a low in month 12, on light volume.
const BEAR: [number, number, number][] = Array.from({ length: 13 }, (_, i) => [100 - i * 4, 96 - i * 4, 20]);
const LOW = BEAR.length - 1;

describe("the first rally out of a bear market (A-TIME-03)", () => {
  it("labels an advance that stalls before its third month on heavy volume a first rally", () => {
    // Two months up on heavy volume, then the third month makes no new high.
    const bars = months([...BEAR, [60, 50, 60], [70, 58, 55], [68, 60, 30]]);
    const r = readFirstRally(bars);
    expect(r?.lowMonth).toBe(bars[LOW].t.slice(0, 7));
    expect(r?.advanceMonths).toBe(2);
    expect(r?.state).toBe("firstRally");
  });

  it("does not call the stall a first rally when the volume was not large", () => {
    const bars = months([...BEAR, [60, 50, 22], [70, 58, 21], [68, 60, 20]]);
    expect(readFirstRally(bars)?.state).toBe("stalled");
  });

  it("calls an advance that rises three full months or more a bull campaign", () => {
    const bars = months([...BEAR, [60, 50, 60], [70, 58, 55], [78, 66, 50], [80, 70, 40]]);
    const r = readFirstRally(bars);
    expect(r?.advanceMonths).toBeGreaterThanOrEqual(3);
    expect(r?.state).toBe("bullCampaign");
  });

  it("counts a top exactly three months after the low as a bull campaign", () => {
    // The top is the third month after the low; the month after it is lower.
    const bars = months([...BEAR, [60, 50, 60], [70, 58, 55], [78, 66, 50], [76, 68, 30]]);
    const r = readFirstRally(bars);
    expect(r?.topMonth).toBe(bars[LOW + 3].t.slice(0, 7));
    expect(r?.advanceMonths).toBe(3);
    expect(r?.state).toBe("bullCampaign");
  });

  it("waits while the advance is still in its first two months", () => {
    const bars = months([...BEAR, [60, 50, 60], [70, 58, 55]]);
    expect(readFirstRally(bars)?.state).toBe("early");
  });

  it("reads nothing without a bear market low to count from", () => {
    expect(readFirstRally(months(BEAR.slice(0, 4)))).toBeNull();
  });
});

describe("on the setup", () => {
  it("is read from the stock's months and shown for context", () => {
    const rows: [number, number, number][] = [...BEAR, [60, 50, 60], [70, 58, 55], [68, 60, 30]];
    const daily: Bar[] = [];
    rows.forEach(([h, l, v], m) => {
      for (let d = 0; d < 20; d++) {
        const t = new Date(Date.UTC(2000, m, 1 + d, 15)).toISOString();
        // The month's extremes on its first two days; the other days inside them.
        const hi = d === 0 ? h : h - 0.5;
        const lo = d === 1 ? l : l + 0.5;
        daily.push({ t, o: (hi + lo) / 2, h: hi, l: lo, c: (hi + lo) / 2, v: v / 20 });
      }
    });
    const asOf = new Date(daily[daily.length - 1].t);
    const ctx = readDisclosedRules(daily, daily[daily.length - 1].c, null, asOf);
    expect(ctx.firstRally?.state).toBe("firstRally");
    expect(describeDisclosedRules(ctx).some((l) => /first rally/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 64).firstRallyOnly).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 64).bullCampaignThreeMonths).toBe(false);
  });
});
