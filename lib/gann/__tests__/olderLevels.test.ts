/**
 * Old levels beyond the 3-Day Chart (PLAN.md item 5, step 3). Gann buys any
 * small reaction after a stock crosses the top of a previous year by 3 points,
 * and a break of a previous year's bottom by 3 points is a short (W006 pp.20,
 * 22, 47). New all-time highs are usually safe buys (p.47), and the further
 * back an old top, the more important its crossing (p.24). The crossing is
 * bought as every crossing is: 1 point past the level, stop 3 points the
 * other side (pp.20, 46-47).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannThreePoints } from "@/lib/gann/pointScale";
import {
  computeGannEntryTrigger,
  nearerBuyingPoint,
  olderGannLevels,
  selectGannEntry,
  type GannEntryTrigger,
} from "@/lib/gann/entryTrigger";
import { entryChart } from "@/lib/scan/entrySelection";
import { heldOnDailyChart } from "@/lib/lifecycle/confirmNow";
import { entryCrossedLevel } from "@/lib/trade/gann-exit-live";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], start: string, half = 0.3): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
/** One bar per month from `from` (YYYY-MM) for `n` months; `hl(i)` gives its high and low. */
function monthly(from: string, n: number, hl: (i: number, month: string) => [number, number]): Bar[] {
  const [y0, m0] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const [h, l] = hl(i, month);
    const c = (h + l) / 2;
    return { t: `${month}-01T05:00:00Z`, o: c, h, l, c, v: 1e8 };
  });
}
const zig = (lo: number, hi: number, times: number) => Array.from({ length: times }, () => [...leg(lo, hi, 5), ...leg(hi, lo, 5)]).flat();

const ASOF = "2026-06-01";
const P100 = gannThreePoints(100);

// 2025's top is 100, in June. The record before the 52 weeks is 95 (early
// 2025), and the 2026 swings top above it, so it is no longer the record.
// 2026 swings between 90 and 96, then rallies through 100 by more than 3
// points and reacts without reaching the buy.
const M_TOP = monthly("2016-01", 125, (_i, month) => (month === "2025-06" ? [100, 92] : month < "2025-01" ? [80, 70] : [95, 88]));
const UP = [...zig(90, 96, 8), ...leg(90, 107, 10), ...leg(107, 103.5, 3)];
const D_TOP = daily(UP, "2026-01-05");

describe("the older levels from the monthly chart", () => {
  it("reads the previous calendar year's top and bottom, and the record before the 52 weeks", () => {
    const levels = olderGannLevels(M_TOP, ASOF, "2025-06-02");
    const prior = levels.filter((l) => l.source === "priorYear");
    expect(prior.find((l) => l.kind === "top")).toMatchObject({ price: 100, formedAt: "2025-06-01T05:00:00Z", crossFrom: "2026-01-01" });
    expect(prior.find((l) => l.kind === "bottom")?.price).toBe(88);
    const record = levels.filter((l) => l.source === "allTime");
    expect(record.find((l) => l.kind === "top")?.price).toBe(95);
    expect(record.find((l) => l.kind === "bottom")?.price).toBe(70);
    expect(record.every((l) => l.crossFrom === "2025-06-02")).toBe(true);
  });

  it("leaves out the month still forming and gives nothing for a year with no bars", () => {
    const withForming = [...M_TOP, ...monthly("2026-06", 1, () => [500, 1])];
    expect(olderGannLevels(withForming, ASOF, "2025-06-02")).toEqual(olderGannLevels(M_TOP, ASOF, "2025-06-02"));
    // Every previous year counts since the step 3 review (R9): a year with no
    // bars gives no level, and the years before it still do.
    const no2025 = olderGannLevels(M_TOP.filter((b) => b.t < "2025"), ASOF, "2025-06-02");
    expect(no2025.some((l) => l.year === 2025)).toBe(false);
    expect(no2025.some((l) => l.year === 2024)).toBe(true);
  });
});

describe("the top of a previous year (A-ENTRY-05)", () => {
  const older = olderGannLevels(M_TOP, ASOF, "2025-06-02");

  it("crossed by 3 points, is bought on the reaction 1 point above it with the stop 3 points under", () => {
    const t = selectGannEntry(D_TOP, "bullish", older)!;
    expect(t).toMatchObject({ kind: "crossing", held: true, source: "priorYear", level: 100, formedAt: "2025-06-01T05:00:00Z" });
    expect(t.reactionEntry).toBeCloseTo(100 + P100 / 3, 8);
    expect(t.reactionStop).toBeCloseTo(100 - P100, 8);
  });

  it("is not crossed by a close 2 points over it", () => {
    const short = daily([...zig(90, 96, 8), ...leg(90, 100 + (2 * P100) / 3, 10), ...leg(100 + (2 * P100) / 3, 102.5, 3)], "2026-01-05");
    const t = computeGannEntryTrigger(short, "bullish", undefined, undefined, true, older);
    expect(t?.source).not.toBe("priorYear");
  });

  it("counts only closes in the current year", () => {
    // The same rally a year earlier is not a crossing of the previous year's top.
    const t = computeGannEntryTrigger(daily(UP, "2025-01-06"), "bullish", undefined, undefined, true, older);
    expect(t?.source).not.toBe("priorYear");
  });

  it("once bought, is not offered again", () => {
    const bought = daily([...UP, ...leg(103.5, 100 + P100 / 3 - 0.2, 2)], "2026-01-05");
    expect(computeGannEntryTrigger(bought, "bullish", undefined, undefined, true, older)?.source).not.toBe("priorYear");
  });
});

describe("the bottom of a previous year (A-ENTRY-17)", () => {
  const M = monthly("2016-01", 125, (_i, month) => (month === "2025-06" ? [108, 100] : month < "2025-01" ? [130, 120] : [112, 105]));
  const older = olderGannLevels(M, ASOF, "2025-06-02");

  it("broken by 3 points, is sold on the rally 1 point under it with the stop 3 points over", () => {
    const d = daily([...zig(104, 110, 8), ...leg(110, 93, 10), ...leg(93, 96.5, 3)], "2026-01-05");
    const t = selectGannEntry(d, "bearish", older)!;
    expect(t).toMatchObject({ kind: "crossing", held: true, source: "priorYear", level: 100, direction: "bearish" });
    expect(t.reactionEntry).toBeCloseTo(100 - P100 / 3, 8);
    expect(t.reactionStop).toBeCloseTo(100 + P100, 8);
  });

  it("needs no distribution spell before it, unlike a swing bottom (A-ENTRY-15)", () => {
    const d = daily([...zig(104, 124, 4), ...leg(104, 93, 10), ...leg(93, 96.5, 3)], "2026-01-05");
    const t = selectGannEntry(d, "bearish", older)!;
    expect(t).toMatchObject({ source: "priorYear", level: 100, direction: "bearish" });
  });
});

describe("the all-time high (A-ENTRY-06)", () => {
  // The record, 120 in March 2021, formed before the 52 weeks; 2025's top is 110.
  const M = monthly("2016-01", 125, (_i, month) => (month === "2021-03" ? [120, 100] : month >= "2025-01" ? [110, 100] : [105, 95]));
  const older = olderGannLevels(M, ASOF, "2025-06-02");
  const P120 = gannThreePoints(120);

  it("crossed by 3 points is a buying point like any old top, labelled as the record", () => {
    const d = daily([...zig(104, 109, 8), ...leg(104, 128, 12), ...leg(128, 124, 3)], "2026-01-05");
    const t = selectGannEntry(d, "bullish", older)!;
    expect(t).toMatchObject({ held: true, source: "allTime", level: 120, formedAt: "2021-03-01T05:00:00Z", newRecord: true });
    expect(t.reactionEntry).toBeCloseTo(120 + P120 / 3, 8);
    expect(t.reactionStop).toBeCloseTo(120 - P120, 8);
  });

  it("is still an old top crossed when a higher top formed since", () => {
    // A top of 121 in the swings, not crossed; the old record of 120 is.
    const swings = zig(104, 109, 8);
    swings[23] = 120.7;
    const d = daily([...swings, ...leg(104, 126.2, 12), ...leg(126.2, 123.5, 3)], "2026-01-05");
    const t = selectGannEntry(d, "bullish", older)!;
    expect(t).toMatchObject({ held: true, source: "allTime", level: 120 });
    // The close is above the 121 top as well: a new record on the chart.
    expect(t.newRecord).toBe(true);
  });

  it("does not call it a new record when a higher top inside the 52 weeks stands above the close", () => {
    // A spike to 128 that closed back near 109, so it crossed nothing; the
    // rally's close beats the old record of 120 but not that high.
    const d = daily([...zig(104, 109, 8), ...leg(104, 126.2, 12), ...leg(126.2, 123.5, 3)], "2026-01-05");
    d[23] = { ...d[23], h: 128 };
    const t = selectGannEntry(d, "bullish", older)!;
    expect(t).toMatchObject({ held: true, source: "allTime", level: 120, newRecord: false });
    const close = d.find((b) => b.t === t.crossedAt)!.c;
    expect(close).toBeGreaterThan(120);
    expect(close).toBeLessThan(128);
  });

  it("does not call a crossing a new record while an older high stands above it", () => {
    const M_HIGH = monthly("2016-01", 125, (_i, month) => (month === "2025-06" ? [100, 92] : month < "2025-01" ? [130, 70] : [95, 88]));
    const t = selectGannEntry(D_TOP, "bullish", olderGannLevels(M_HIGH, ASOF, "2025-06-02"))!;
    expect(t).toMatchObject({ source: "priorYear", newRecord: false });
    // Without the monthly record there is nothing to compare against.
    expect(selectGannEntry(D_TOP, "bullish")!.newRecord).toBeUndefined();
  });
});

describe("a previous year's top that is also the last swing top", () => {
  // October 2025's top of about 100 is both 2025's top and the only swing top;
  // a straight rally crosses it in January 2026.
  const d = daily([...leg(90, 99.7, 10), ...leg(99.7, 92, 45), ...leg(92, 106, 60)], "2025-10-06");
  const m = [
    ...monthly("2016-01", 117, () => [90, 85]),
    ...["2025-10", "2025-11", "2025-12", "2026-01"].map((month) => {
      const days = d.filter((b) => b.t.startsWith(month));
      return { t: `${month}-01T05:00:00Z`, o: days[0].o, h: Math.max(...days.map((b) => b.h)), l: Math.min(...days.map((b) => b.l)), c: days[days.length - 1].c, v: 1e8 };
    }),
  ];
  const older = olderGannLevels(m, ASOF, "2025-06-02");

  it("is named as the previous year's top, the older reading of one level (W006 p.24)", () => {
    const t = computeGannEntryTrigger(d, "bullish", undefined, undefined, true, older)!;
    expect(t).toMatchObject({ held: true, source: "priorYear" });
    expect(t.level).toBe(d[9].h);
  });

  it("once bought, is not offered again as the swing top at the same price", () => {
    const bought = [...d, ...daily(leg(106, 100 + P100 / 3 - 0.1, 2), new Date(Date.parse(d[d.length - 1].t) + DAY).toISOString().slice(0, 10))];
    expect(computeGannEntryTrigger(bought, "bullish", undefined, undefined, true, older)).toBeNull();
  });
});

describe("the older level first (A-ENTRY-09)", () => {
  const base = computeGannEntryTrigger(D_TOP, "bullish")!;
  const at = (formedAt: string, reactionEntry: number, kind: GannEntryTrigger["kind"] = "crossing"): GannEntryTrigger => ({
    ...base, kind, held: true, reactionEntry, formedAt,
  });

  // Two crossings never compete in `nearerBuyingPoint` (step 3 review R5): the
  // older of two readings of one level is chosen where the crossing is found,
  // tested through the scan's path in lib/__tests__/score.test.ts.
  it("takes the nearer buying point", () => {
    expect(nearerBuyingPoint(at("2026-03-01", 101), at("2021-03-01", 98), 100).formedAt).toBe("2026-03-01");
  });

  it("then the crossing over the old level", () => {
    expect(nearerBuyingPoint(at("2026-03-01", 99, "oldLevel"), at("2026-03-01", 101), 100).kind).toBe("crossing");
  });

  it("dates every buying point by when its level formed", () => {
    const t = computeGannEntryTrigger(D_TOP, "bullish")!;
    expect(t.source).toBe("swing");
    expect(t.formedAt).toBe(D_TOP[t.pivot.index].t);
  });
});

describe("every surface reads the older levels", () => {
  const chart = entryChart([...D_TOP], M_TOP, ASOF);
  const t = selectGannEntry(chart.bars, "bullish", chart.older)!;

  it("entryChart gives the window and the levels for the day", () => {
    expect(chart.older).toEqual(olderGannLevels(M_TOP, ASOF, "2025-06-02"));
    expect(t.source).toBe("priorYear");
  });

  it("confirmation finds the held level the scan priced", () => {
    expect(heldOnDailyChart(D_TOP, new Date(`${ASOF}T15:00:00Z`), "bullish", t.reactionEntry, M_TOP)).toBe(true);
  });

  it("the live exit recovers it as the crossed level", () => {
    expect(entryCrossedLevel("long", t.reactionEntry, `${ASOF}T15:00:00Z`, D_TOP, M_TOP)).toBe(100);
  });
});
