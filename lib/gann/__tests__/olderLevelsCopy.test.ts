/**
 * What a person reads about a crossing names the level crossed: the previous
 * year's top or bottom, or the record from before the last 52 weeks, as well
 * as the last swing (PLAN.md item 5, step 3). The plan's levels carry it, and
 * the signal card and the graduation exam say it.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { olderGannLevels, selectGannEntry } from "@/lib/gann/entryTrigger";
import { computeTradeLevels, gannEntrySource } from "@/lib/strat/levels";
import { entryChart } from "@/lib/scan/entrySelection";
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

// 2025's top is 100; 2026 crosses it by 3 points and reacts above the buy.
const M = monthly("2016-01", 125, (month) => (month === "2025-06" ? [100, 92] : month < "2025-01" ? [80, 70] : [95, 88]));
const D = daily([...zig(90, 96, 8), ...leg(90, 107, 10), ...leg(107, 103.5, 3)], "2026-01-05");
const T = selectGannEntry(D, "bullish", olderGannLevels(M, "2026-06-01", "2025-06-02"))!;

describe("the plan's levels", () => {
  it("carry the source of the crossed level, for stocks and crypto alike", () => {
    expect(T.source).toBe("priorYear");
    for (const assetClass of ["us_equity", "crypto"] as const) {
      const l = computeTradeLevels(gannEntrySource(T), D[D.length - 1], [], undefined, 0.4, assetClass, false, [90, 115, 120]);
      expect(l.entrySource).toBe("priorYear");
    }
    const swing = selectGannEntry(D, "bullish")!;
    expect(computeTradeLevels(gannEntrySource(swing), D[D.length - 1], [], undefined, 0.4, "us_equity", false, [90, 115, 120])).not.toHaveProperty("entrySource");
  });
});

describe("the signal card's headline", () => {
  it("names the previous year's level or the record, and the mirror", () => {
    expect(structuralTriggerHeadline("bullish", "crossing", "priorYear")).toMatch(/^A close 3 points over the previous year's top/);
    expect(structuralTriggerHeadline("bearish", "crossing", "priorYear")).toMatch(/^A close 3 points under the previous year's bottom/);
    expect(structuralTriggerHeadline("bullish", "crossing", "allTime")).toMatch(/record high from before the last 52 weeks/);
    expect(structuralTriggerHeadline("bearish", "crossing", "allTime")).toMatch(/record low from before the last 52 weeks/);
    expect(structuralTriggerHeadline("bullish")).toMatch(/prior confirmed swing high/);
  });
});

describe("the graduation exam", () => {
  const key = (source?: "priorYear" | "allTime"): StoredScenario => ({
    view: { symbol: "TEST", asOf: "2026-04-09", bars: [], entryChoices: [], stopChoices: [] },
    key: { trend: "up", decision: "trade", direction: "bullish", entryChoiceId: "e1", stopChoiceId: "s1", entry: 101.66, stop: 95.02, shares: 150, crossed: true, ...(source ? { source } : {}) },
    playback: [{ t: "2026-04-10", h: 104, l: 103, c: 103.5 }],
  });
  const entryText = (s: StoredScenario) =>
    gradeExam("pro_to_expert", [s], [{ trend: "up", decision: "trade", entryChoiceId: "e1" }]).scenarios[0].items.find((x) => x.item === "entry")!.explanation;

  it("names the crossed level in the entry's explanation", () => {
    expect(entryText(key("priorYear"))).toMatch(/1 point past the previous year's top/);
    expect(entryText(key("allTime"))).toMatch(/1 point past the record high from before the last 52 weeks/);
    expect(entryText(key())).toMatch(/1 point past the last swing top/);
  });

  it("records the source on the key it builds", () => {
    // Seven days up 2, three days down 1, from the first day of 2026: a
    // confirmed uptrend that crosses 2025's top of 170 and holds over it.
    const stairs = Array.from({ length: 200 }, (_, i) => 100 + Math.floor(i / 10) * 11 + (i % 10 < 7 ? (i % 10) * 2 : 12 - (i % 10 - 6)));
    const bars = daily(stairs, "2026-01-01", 0.6);
    const top = monthly("2016-01", 125, (month) => (month === "2025-09" ? [170, 162] : month < "2025-01" ? [80, 70] : [160, 152]));
    const chart = entryChart(bars, top, "2026-03-10");
    expect(selectGannEntry(chart.bars, "bullish", chart.older)).toMatchObject({ source: "priorYear", level: 170, held: true });
    const s = buildScenario("TEST", "2026-03-10", bars, 7, top);
    expect(s?.key.decision).toBe("trade");
    expect(s?.key.source).toBe("priorYear");
    // Without the monthly chart the same day prices from the last swing.
    const plain = buildScenario("TEST", "2026-03-10", bars, 7)!;
    expect(plain.key.decision).toBe("trade");
    expect(plain.key).not.toHaveProperty("source");
  });
});

describe("the lessons", () => {
  it("teach the previous year's level and the record as levels to cross", () => {
    const text = ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === "academy-6/method-rules/entries-and-exits")!.instruction.join(" ");
    expect(text).toMatch(/previous year's top or bottom/);
    expect(text).toMatch(/record/);
  });
});
