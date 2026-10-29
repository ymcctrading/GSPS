/**
 * The stock's monthly main trend and the short-sale hold (2026-10-29): Gann
 * decides the main trend on the monthly chart and does not sell short while it
 * is up (`mainTrend.ts`).
 */
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { MIN_MAIN_TREND_MONTHS, readMonthlyMainTrend, shortAgainstMainTrend } from "@/lib/gann/mainTrend";
import { applyMainTrendHold } from "@/lib/scoring/score";
import { readPillarFacts } from "@/lib/scoring/pillars";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import { tradeHold, AGAINST_MAIN_TREND, AGAINST_DAILY_TREND } from "@/lib/scanner/intradayDisplay";

const exec = (score = 8): ScanDecision => ({ score, outputState: "Execute", breakdown: [] });

/** Monthly bars through the given closes, one month each, from January 2020. */
function months(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const d = new Date(Date.UTC(2020, i, 1));
    return { t: d.toISOString(), o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 1e7 };
  });
}

// Up in swings: three-month advances, one- and two-month reactions inside them.
const UP = months([100, 104, 108, 112, 110, 114, 118, 122, 120, 118, 124, 128, 132, 130, 134]);
// A top, a sharp break, a lower rally, then a break under the first break's low.
const TURNED_DOWN = months([100, 110, 120, 130, 122, 114, 106, 112, 118, 116, 108, 100, 92, 96, 88]);

describe("readMonthlyMainTrend", () => {
  it("reads a rising monthly swing chart as up, through its short reactions", () => {
    expect(readMonthlyMainTrend(UP)).toBe("bullish");
  });

  it("reads down once a rally fails and price breaks the first sharp break's low", () => {
    expect(readMonthlyMainTrend(TURNED_DOWN)).toBe("bearish");
  });

  it("reads nothing on too short a record", () => {
    expect(readMonthlyMainTrend(UP.slice(0, MIN_MAIN_TREND_MONTHS - 1))).toBeNull();
  });

  it("permits a short only on a main trend read down, and never holds a long", () => {
    expect(shortAgainstMainTrend("bullish", "bearish")).toBe(true);
    expect(shortAgainstMainTrend(null, "bearish")).toBe(true);
    expect(shortAgainstMainTrend("bearish", "bearish")).toBe(false);
    expect(shortAgainstMainTrend("bearish", "bullish")).toBe(false);
    expect(shortAgainstMainTrend(null, "none")).toBe(false);
  });
});

describe("applyMainTrendHold", () => {
  it("holds a short Execute to Watch while the main trend is up or unread", () => {
    const held = applyMainTrendHold(exec(), "bullish", "bearish");
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("mainTrend");
    expect(applyMainTrendHold(exec(), null, "bearish").outputState).toBe("Watch");
  });

  it("lets a short through once the main trend reads down, and leaves longs, Watch and no side alone", () => {
    expect(applyMainTrendHold(exec(), "bearish", "bearish").outputState).toBe("Execute");
    expect(applyMainTrendHold(exec(), "bearish", "bullish").outputState).toBe("Execute");
    expect(applyMainTrendHold(exec(), null, "none").outputState).toBe("Execute");
    const watch: ScanDecision = { score: 6, outputState: "Watch", breakdown: [] };
    expect(applyMainTrendHold(watch, "bullish", "bearish")).toBe(watch);
  });

  it("names the hold in plain words on the public summary", () => {
    const summary = toPublicScoreSummary(applyMainTrendHold(exec(), "bullish", "bearish"));
    expect(JSON.stringify(summary)).toContain("longer-term trend has not turned down yet");
  });
});

describe("the pillar facts read it from the closed months", () => {
  it("reads the stock's own monthly chart, leaving the month in progress out", () => {
    const daily: Bar[] = [{ t: "2021-04-15T05:00:00Z", o: 88, h: 89, l: 87, c: 88, v: 1e6 }];
    // A month in progress that would turn the chart back up is not read.
    const inProgress = { t: "2021-04-01T00:00:00Z", o: 106, h: 140, l: 106, c: 139, v: 1e7 };
    const facts = readPillarFacts({
      rules: {} as never,
      daily,
      monthly: [...TURNED_DOWN, inProgress],
      marketDaily: null,
      universe: null,
      oldLevels: [],
      price: 88,
      asOf: new Date("2021-04-15T12:00:00Z"),
    });
    expect(facts.mainTrend).toBe("bearish");
    // Read with the month in progress, the chart would have turned back up.
    expect(readMonthlyMainTrend([...TURNED_DOWN, inProgress])).toBe("bullish");
  });
});

describe("intraday sale alerts before the main trend turns", () => {
  it("are shown for study, never offered as a trade, after the daily-trend note", () => {
    expect(tradeHold({ type: "old_level_cross", againstMainTrend: true })).toBe(AGAINST_MAIN_TREND);
    expect(tradeHold({ type: "old_level_cross", againstMainTrend: true, againstDailyTrend: true })).toBe(AGAINST_DAILY_TREND);
    expect(tradeHold({ type: "old_level_cross" })).toBeNull();
  });
});
