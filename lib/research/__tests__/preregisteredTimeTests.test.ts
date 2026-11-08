import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  CLUSTER_MIN,
  aspectCountsByMonth,
  normalisedMonthlyRanges,
  saturnTravel,
  seeded,
  testAspectClusters,
  testMonthlyDates,
  testSaturnTravel,
  trainMonthlyDates,
  type SaturnCase,
} from "@/lib/research/preregisteredTimeTests";

// Q33, Q38, Q40 (owner, 2026-10-16): research only, rules fixed before data.

describe("monthly dates (A-TIME-22)", () => {
  it("chooses the four busiest days of the month, ties to the earlier day", () => {
    const daily = Array.from({ length: 40 }, (_, i) => ({ t: `2020-0${1 + (i % 9)}-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    const turns = daily.map((b, i) => (["05", "06", "20", "21"].includes(b.t.slice(8, 10)) ? i : -1)).filter((i) => i >= 0);
    expect(trainMonthlyDates(daily, turns)).toEqual([5, 6, 20, 21]);
  });

  it("finds a planted set of dates and calls random days null", () => {
    const planted = { chosen: [1, 15, 18, 19], testDays: [1, 15, 18, 19, 1, 15, 2, 14, 18, 19] };
    const r = testMonthlyDates([planted, planted, planted]);
    expect(r.p).toBeLessThan(0.05);
    expect(r.observed).toBeGreaterThan(r.nullMean);
    const rand = seeded(7);
    const noise = Array.from({ length: 20 }, () => ({ chosen: [3, 9, 24, 28], testDays: Array.from({ length: 30 }, () => 1 + Math.floor(rand() * 31)) }));
    const n = testMonthlyDates(noise);
    expect(Math.abs(n.observed - n.nullMean)).toBeLessThan(0.05);
  });
});

describe("Saturn's travel in price (A-ASTRO-04)", () => {
  it("measures Saturn's geocentric travel, about 12 degrees a year net of its loops", () => {
    const deg = saturnTravel(Date.parse("2020-01-01T00:00:00Z"), Date.parse("2021-01-01T00:00:00Z"));
    expect(deg).toBeGreaterThan(9);
    expect(deg).toBeLessThan(15);
  });

  it("finds turns planted on the line and no edge for turns off it", () => {
    // Each planted on Saturn's real travel from its own low, so another low's travel misses them.
    const planted = (iso: string): SaturnCase => {
      const from = Date.parse(iso);
      const turns = [60, 200, 380, 520, 700].map((days) => {
        const travel = saturnTravel(from, from + days * 86_400_000);
        return { travel, price: 100 + 30 * travel * 0.1, days };
      });
      return { low: 100, unit: 0.1, start: from, turns };
    };
    const r = testSaturnTravel([planted("2020-01-01T00:00:00Z"), planted("2010-06-01T00:00:00Z"), planted("2003-03-01T00:00:00Z")]);
    expect(r.p).toBeLessThan(0.05);
    const rand = seeded(3);
    const off: SaturnCase = {
      low: 100,
      unit: 0.1,
      start: Date.parse("2015-01-01T00:00:00Z"),
      turns: Array.from({ length: 60 }, () => ({ travel: rand() * 30, price: 100 + rand() * 90, days: 1 + Math.floor(rand() * 729) })),
    };
    const o = testSaturnTravel([off, { ...off, start: Date.parse("2008-01-01T00:00:00Z") }]);
    expect(Math.abs(o.observed - o.nullMean)).toBeLessThan(0.05);
  });

  it("does not credit a line merely for starting at the low (the 2026-11-08 correction)", () => {
    // Turns retesting the low a day or two later: Saturn has barely moved (about 1/30 degree a day, so about 1 point a day
    // on this scale), and neither has any other start date's travel. The old shift null scored these as Saturn hits.
    const retest = (iso: string): SaturnCase => {
      const start = Date.parse(iso);
      const turns = [1, 2].map((days) => ({ travel: saturnTravel(start, start + days * 86_400_000), price: 100, days }));
      return { low: 100, unit: 1, start, turns };
    };
    const r = testSaturnTravel([retest("2019-05-01T00:00:00Z"), retest("2012-09-01T00:00:00Z"), retest("2005-02-01T00:00:00Z")]);
    expect(r.observed).toBeGreaterThan(0.5);
    expect(r.p).toBeGreaterThan(0.05);
  });
});

describe("a month of many aspects (A-ASTRO-06)", () => {
  it("counts aspect entries by month, and some months cluster", () => {
    const counts = aspectCountsByMonth("2020-01-01", "2020-12-31");
    expect(counts.size).toBe(12);
    expect([...counts.values()].some((n) => n >= CLUSTER_MIN)).toBe(true);
  });

  it("finds wider swings planted in cluster months", () => {
    const counts = new Map(Array.from({ length: 48 }, (_, i) => [`20${20 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, i % 7 === 0 ? 5 : 0] as const));
    const wide = new Map([...counts].map(([m, n]) => [m, n >= CLUSTER_MIN ? 2 : 1] as const));
    expect(testAspectClusters([wide, wide], counts).p).toBeLessThan(0.05);
    const flat = new Map([...counts].map(([m]) => [m, 1] as const));
    expect(testAspectClusters([flat], counts).p).toBeGreaterThan(0.05);
  });

  it("normalises a month's range by the symbol's median month", () => {
    const daily = [
      { t: "2020-01-02T00:00:00Z", o: 10, h: 11, l: 10, c: 10, v: 1 },
      { t: "2020-02-03T00:00:00Z", o: 10, h: 12.1, l: 10, c: 10, v: 1 },
      { t: "2020-03-02T00:00:00Z", o: 10, h: 11, l: 10, c: 10, v: 1 },
    ];
    expect(normalisedMonthlyRanges(daily).get("2020-01")).toBeCloseTo(1, 6);
    expect(normalisedMonthlyRanges(daily).get("2020-02")!).toBeGreaterThan(1.9);
  });

  it("never feeds a verdict: no product module imports it", () => {
    for (const f of ["lib/scanTicker.ts", "lib/backtest/replay.ts", "lib/scoring/score.ts", "lib/gann/disclosedRules.ts"]) {
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/preregisteredTimeTests/);
    }
  });
});
