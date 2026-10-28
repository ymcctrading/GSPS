/**
 * What a person reads about an older level after the step 3 review: the year
 * of the top or bottom crossed (R9), the exam's chart showing what it grades
 * (R6), the exam's decision in the words of the level (R7), and the lessons
 * (R4, R7).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { selectGannEntry, type GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { computeTradeLevels, gannEntrySource } from "@/lib/strat/levels";
import { entryChart, entryChartBars } from "@/lib/scan/entrySelection";
import { structuralTriggerHeadline } from "@/lib/scoring/direction-copy";
import { buildScenario, gradeExam, type StoredScenario } from "@/lib/school/graduationExam";
import { ACADEMIES } from "@/lib/school/curriculum";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], start: string, half = 0.3): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
function monthly(from: string, n: number, hl: (month: string) => [number, number]): Bar[] {
  const [y0, m0] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const month = `${y}-${String(((m0 - 1 + i) % 12) + 1).padStart(2, "0")}`;
    const [h, l] = hl(month);
    return { t: `${month}-01T05:00:00Z`, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1e8 };
  });
}
const zig = (lo: number, hi: number, times: number) => Array.from({ length: times }, () => [...leg(lo, hi, 5), ...leg(hi, lo, 5)]).flat();
const stairs = (n: number) => Array.from({ length: n }, (_, i) => 100 + Math.floor(i / 10) * 11 + (i % 10 < 7 ? (i % 10) * 2 : 12 - (i % 10 - 6)));

// 2024's top is 120 under a 2021 record of 150; 2026 crosses 120 by 3 points.
const M = monthly("2016-01", 125, (m) => (m === "2021-04" ? [150, 130] : m === "2024-05" ? [120, 104] : m.startsWith("2025") ? [100, 90] : [85, 70]));
const D = daily([...zig(108, 116, 8), ...leg(108, 129, 10), ...leg(129, 125.5, 3)], "2026-01-05");
const chart = entryChart(D, M, "2026-06-01");
const T = selectGannEntry(chart.bars, "bullish", chart.older)!;

describe("the year of the level crossed", () => {
  it("is carried onto the plan, for stocks and crypto alike, and names the setup", () => {
    expect(T).toMatchObject({ source: "priorYear", levelYear: 2024 });
    for (const assetClass of ["us_equity", "crypto"] as const) {
      const l = computeTradeLevels(gannEntrySource(T), D[D.length - 1], [], undefined, 0.4, assetClass, false, [110, 135, 140]);
      expect(l).toMatchObject({ entrySource: "priorYear", entryLevelYear: 2024 });
    }
    expect(gannEntrySource(T).setupLabel).toBe("2024 top crossing");
    expect(gannEntrySource({ ...T, direction: "bearish" } as GannEntryTrigger).setupLabel).toBe("2024 bottom break");
  });

  it("is named in the signal card's headline, and the previous year's when the year is unknown", () => {
    expect(structuralTriggerHeadline("bullish", "crossing", "priorYear", undefined, 2024)).toMatch(/^A close clearly over the 2024 top/);
    expect(structuralTriggerHeadline("bearish", "crossing", "priorYear", undefined, 2024)).toMatch(/^A close clearly under the 2024 bottom/);
    expect(structuralTriggerHeadline("bullish", "crossing", "priorYear")).toMatch(/the previous year's top/);
  });
});

describe("the exam shows what it grades (R6)", () => {
  // From the first day of 2026, a confirmed uptrend that crosses 2025's top
  // of 170 and holds over it (the step 3 fixture).
  const bars = daily(stairs(200), "2026-01-01", 0.6);
  const top = monthly("2016-01", 125, (m) => (m === "2025-09" ? [170, 162] : m < "2025-01" ? [80, 70] : [160, 152]));

  it("draws the older levels near the price, the one the key rests on among them", () => {
    const s = buildScenario("TEST", "2026-03-10", bars, 7, top)!;
    expect(s.key).toMatchObject({ source: "priorYear", levelYear: 2025 });
    expect(s.view.levels).toContainEqual({ price: 170, label: "2025 top" });
    expect(s.view.levels).toContainEqual({ price: 160, label: "Record high" });
    expect(s.view.levels!.length).toBeLessThanOrEqual(4);
  });

  it("sets no chart whose key rests on an older level the chart would not draw", () => {
    // 2022's and 2023's bottoms sit between the price and 2025's top, so the
    // two nearest levels under the price are those bottoms, not the top bought.
    const crowded = monthly("2016-01", 125, (m) =>
      m === "2025-09" ? [170, 162] : m.startsWith("2023") ? [178.5, 175] : m.startsWith("2022") ? [179, 176] : m < "2025-01" ? [80, 70] : [160, 152],
    );
    const chart = entryChart(bars, crowded, "2026-03-10");
    expect(selectGannEntry(chart.bars, "bullish", chart.older)).toMatchObject({ source: "priorYear", level: 170, held: true });
    expect(buildScenario("TEST", "2026-03-10", bars, 7, crowded)).toBeNull();
  });

  it("draws them on a chart keyed on a swing as well, so they give nothing away", () => {
    const long = daily(stairs(300), "2025-01-01", 0.6);
    const old = monthly("2016-01", 108, () => [80, 70]);
    const s = buildScenario("TEST", long[280].t.slice(0, 10), long, 7, old)!;
    expect(s.key).not.toHaveProperty("source");
    expect(s.view.levels).toContainEqual({ price: 80, label: "Record high" });
  });

  it("shows the 52 weeks of sessions the scan reads, not only the last 120", () => {
    const long = daily(stairs(300), "2025-01-01", 0.6);
    const asOf = long[280].t.slice(0, 10);
    const s = buildScenario("TEST", asOf, long, 7)!;
    expect(s.view.bars).toHaveLength(entryChartBars(long, asOf).length);
    expect(s.view.bars.length).toBeGreaterThan(120);
    expect(s.view.levels).toEqual([]);
  });
});

describe("the exam's words (R7)", () => {
  const key = (k: Partial<StoredScenario["key"]>): StoredScenario => ({
    view: { symbol: "TEST", asOf: "2026-06-01", bars: [], entryChoices: [], stopChoices: [] },
    key: {
      trend: "up", decision: "trade", direction: "bullish", entryChoiceId: "e1", stopChoiceId: "s1",
      entry: 121.9, stop: 114.4, shares: 133, crossed: true, ...k,
    },
    playback: [{ t: "2026-06-02", h: 126, l: 124, c: 125 }],
  });
  const text = (s: StoredScenario, item: string) =>
    gradeExam("pro_to_expert", [s], [{ trend: "up", decision: "trade", entryChoiceId: "e1", stopChoiceId: "s1", shares: 133 }]).scenarios[0].items.find((x) => x.item === item)!.explanation;

  it("says a previous year's level was already crossed, and names its year", () => {
    const s = key({ source: "priorYear", levelYear: 2024 });
    expect(text(s, "decision")).toMatch(/already closed clearly past the 2024 top/);
    expect(text(s, "decision")).not.toMatch(/still to cross/);
    expect(text(s, "entry")).toMatch(/just past the 2024 top/);
  });

  it("names a regained old bottom as the bottom it had broken (A-TREND-10)", () => {
    const s = key({ regained: true });
    expect(text(s, "decision")).toMatch(/already closed clearly past the old swing low it had broken/);
    expect(text(s, "entry")).toMatch(/just past the old swing low it had broken/);
  });

  it("says the last swing top was still to cross when it was", () => {
    expect(text(key({ crossed: false }), "decision")).toMatch(/the last swing top was still to cross/);
    expect(text(key({ source: "allTime" }), "decision")).toMatch(/already closed clearly past the record high/);
  });
});

describe("the lessons (R4, R7)", () => {
  const lesson = (id: string) => ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === id)!.instruction.join(" ");

  it("teach in the Pro course that a previous year's top and the record are crossed the same way", () => {
    const text = lesson("academy-4/reading-the-swings/breakouts-and-stops");
    expect(text).toMatch(/previous year's top/);
    expect(text).toMatch(/record/);
  });

  it("teach that one close through two levels buys over the nearer one, not the older one", () => {
    const text = lesson("academy-6/method-rules/entries-and-exits");
    expect(text).not.toMatch(/the older one counts/);
    expect(text).toMatch(/nearer the price/);
    expect(text).toMatch(/any previous year's top or bottom/);
  });
});

it("prices a previous year's level just past it, as every crossing", () => {
  expect(T.reactionEntry).toBeCloseTo(120 + gannThreePoints(120) / 3, 8);
});
