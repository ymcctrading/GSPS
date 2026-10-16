/**
 * The older levels after review (PLAN.md item 5, step 3 review, R1-R3, R9-R11).
 * Gann's rule is "a previous year": any year's top crossed by 3 points is
 * bought on the reaction, and the further back, the more important (W006
 * pp.20, 22, 24, 47). Each previous year's top and bottom is a level, read
 * from the monthly chart over the same span on every surface, and a level is
 * crossed only by a close the chart shows crossing it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const fetched = vi.hoisted(() => ({ calls: [] as Array<{ timeframe: string; start: Date; end: Date | null }>, daily: [] as Bar[], monthly: [] as Bar[] }));
vi.mock("@/lib/data/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/provider")>("@/lib/data/provider");
  const fetchBars = async (_symbol: string, timeframe: string, start: Date, end: Date | null) => {
    fetched.calls.push({ timeframe, start, end });
    return timeframe === "1Day" ? fetched.daily : timeframe === "1Month" ? fetched.monthly : [];
  };
  return { ...actual, getMarketDataProvider: () => ({ ...actual.getMarketDataProvider(), fetchBars }) };
});
vi.mock("@/lib/data/instrumentReference", () => ({ getInstrumentReference: async () => null }));
vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  // One bullish reversion a session, nothing with the trend: these reviews read the long side alone.
  return {
    ...actual,
    preferredEntryDirection: () => "bullish",
    reversionEntry: (_t: unknown, entryOf: (d: "bullish") => unknown) => entryOf("bullish"),
    armSessionEntries: (_t: unknown, entryOf: (d: "bullish") => unknown) => {
      const trigger = entryOf("bullish");
      return trigger ? [{ setupKind: "reversion", trigger }] : [];
    },
  };
});

import { gannThreePoints } from "@/lib/gann/pointScale";
import {
  OLDER_LEVELS_YEARS,
  computeGannEntryTrigger,
  olderGannLevels,
  sameGannLevel,
  selectGannEntry,
} from "@/lib/gann/entryTrigger";
import { entryChart, monthlyChartFrom } from "@/lib/scan/entrySelection";
import { heldOnDailyChart, readEntryConfirmationNow } from "@/lib/lifecycle/confirmNow";
import { entryCrossedLevel, readLiveGannExit, resetGannExitCache } from "@/lib/trade/gann-exit-live";
import { replay } from "@/lib/backtest/replay";
import { fetchSeries } from "@/lib/backtest/run";
import { TF_LOOKBACK_DAYS } from "@/lib/timeframe";
import { startAttempt } from "@/lib/school/examService";
import type { SupabaseClient } from "@supabase/supabase-js";

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
function aggregate(d: Bar[], months: string[]): Bar[] {
  return months.map((month) => {
    const days = d.filter((b) => b.t.startsWith(month));
    return { t: `${month}-01T05:00:00Z`, o: days[0].o, h: Math.max(...days.map((b) => b.h)), l: Math.min(...days.map((b) => b.l)), c: days[days.length - 1].c, v: 1e8 };
  });
}
const zig = (lo: number, hi: number, times: number) => Array.from({ length: times }, () => [...leg(lo, hi, 5), ...leg(hi, lo, 5)]).flat();
const jan1 = (year: number) => new Date(Date.UTC(year, 0, 1));

describe("every previous year's top and bottom (R9)", () => {
  // 2021's record is 150, 2024's top 120, 2025's top 100. 2026 swings between
  // 108 and 116, then rallies through 120 by more than 3 points and reacts.
  const M = monthly("2016-01", 125, (m) => (m === "2021-04" ? [150, 130] : m === "2024-05" ? [120, 104] : m.startsWith("2025") ? [100, 90] : [85, 70]));
  const D = daily([...zig(108, 116, 8), ...leg(108, 129, 10), ...leg(129, 125.5, 3)], "2026-01-05");

  it("reads a top and bottom for each year, most recent first, each crossable from the next New Year", () => {
    const levels = olderGannLevels(M, "2026-06-01", "2025-06-02").filter((l) => l.source === "priorYear");
    expect(levels.map((l) => l.year)).toEqual([2025, 2025, 2024, 2024, 2023, 2023, 2022, 2022, 2021, 2021, 2020, 2020, 2019, 2019, 2018, 2018, 2017, 2017, 2016, 2016]);
    expect(levels.find((l) => l.year === 2024 && l.kind === "top")).toMatchObject({ price: 120, crossFrom: "2025-01-01", formedAt: "2024-05-01T05:00:00Z" });
    expect(levels.find((l) => l.year === 2021 && l.kind === "top")?.price).toBe(150);
  });

  it("buys the reaction after a close crosses the top of a year before last", () => {
    const chart = entryChart(D, M, "2026-06-01");
    const t = selectGannEntry(chart.bars, "bullish", chart.older)!;
    expect(t).toMatchObject({ kind: "crossing", held: true, source: "priorYear", level: 120, levelYear: 2024 });
    expect(t.reactionEntry).toBeCloseTo(120 + gannThreePoints(120) / 3, 8);
    expect(t.reactionStop).toBeCloseTo(120 - gannThreePoints(120), 8);
  });

  it("names the year of the level a crossing of last year's top bought", () => {
    const M25 = monthly("2016-01", 125, (m) => (m === "2025-06" ? [100, 92] : m < "2025-01" ? [80, 70] : [95, 88]));
    const D25 = daily([...zig(90, 96, 8), ...leg(90, 107, 10), ...leg(107, 103.5, 3)], "2026-01-05");
    const chart = entryChart(D25, M25, "2026-06-01");
    expect(selectGannEntry(chart.bars, "bullish", chart.older)).toMatchObject({ source: "priorYear", level: 100, levelYear: 2025 });
  });
});

describe("a close the chart shows crossing the level", () => {
  it("is needed: a year's top the price already stood above when the 52 weeks began is not crossed", () => {
    // 2018's top of 50 sits far under the whole window; the plan prices from the swings.
    const M = monthly("2016-01", 125, (m) => (m === "2018-03" ? [50, 40] : [45, 30]));
    const D = daily([...zig(90, 96, 8), ...leg(90, 107, 10), ...leg(107, 103.5, 3)], "2026-01-05");
    const chart = entryChart(D, M, "2026-06-01");
    const t = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older)!;
    expect(t.source).toBe("swing");
    // The same buying point as with no older levels; the close is also a new record.
    expect(t).toEqual({ ...computeGannEntryTrigger(chart.bars, "bullish"), newRecord: true });
  });
});

describe("a level with no visible crossing", () => {
  it("is not bought on when nothing else has crossed: the plan waits to cross the last swing top", () => {
    const M = monthly("2016-01", 125, (m) => (m === "2018-03" ? [50, 40] : [45, 30]));
    const D = daily([...zig(90, 96, 8), ...leg(90, 95, 4)], "2026-01-05");
    const chart = entryChart(D, M, "2026-06-01");
    const t = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older)!;
    expect(t).toMatchObject({ held: false, source: "swing" });
    expect(t.level).toBeCloseTo(96.3, 8);
  });
});

describe("a previous year's top across New Year (R1)", () => {
  // The record is 150 (2020) and 2025's top is 100. A close crosses 100 by 3
  // points in December 2026, and the reaction runs on into January 2027.
  const pre = monthly("2016-01", 120, (m) => (m === "2020-03" ? [150, 120] : m === "2025-06" ? [100, 92] : m < "2025-01" ? [80, 70] : [95, 88]));
  const D = daily([...zig(90, 96, 34), ...leg(90, 107, 12), ...leg(107, 102.3, 12)], "2026-01-05");
  const months2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const M = [...pre, ...aggregate(D, months2026)];
  const buy = 100 + gannThreePoints(100) / 3;

  it("stays the held level on both sides of 1 January", () => {
    for (const asOf of ["2026-12-31", "2027-01-04"]) {
      const chart = entryChart(D, M, asOf);
      const t = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older)!;
      expect(t).toMatchObject({ held: true, source: "priorYear", level: 100, levelYear: 2025 });
      expect(t.reactionEntry).toBeCloseTo(buy, 8);
    }
  });

  it("is confirmed and exited on the same level after New Year", () => {
    expect(heldOnDailyChart(D, new Date("2027-01-04T15:00:00Z"), "bullish", buy, M)).toBe(true);
    expect(entryCrossedLevel("long", buy, "2027-01-04T15:00:00Z", D, M)).toBe(100);
  });
});

describe("a bought level does not bring back a lower top already crossed (R3)", () => {
  const M = monthly("2016-01", 125, (m) => (m === "2025-06" ? [100, 92] : m < "2025-01" ? [80, 70] : [95, 88]));
  const older = olderGannLevels(M, "2026-06-01", "2025-06-02");

  it("offers nothing once the reaction has bought the previous year's top", () => {
    // The rally crossed the 96.3 swing top and 2025's top at 100; the dip to
    // 101.6 trades through the buy at 101.66.
    const D = daily([...zig(90, 96, 8), ...leg(90, 107, 10), 104, 101.6], "2026-01-05");
    expect(computeGannEntryTrigger(D, "bullish", undefined, undefined, true, older)).toBeNull();
  });

  it("offers the last top when the rally has not crossed it", () => {
    // A rally to 104 completes a top there; the next close crosses 2025's top
    // at 100 by 3 points but not 104's, and the dip buys 100's reaction.
    const D = daily([...zig(90, 96, 8), ...leg(90, 104, 8), ...leg(104, 101, 3), 105.5, 101.6], "2026-01-05");
    const t = computeGannEntryTrigger(D, "bullish", undefined, undefined, true, older)!;
    expect(t).toMatchObject({ held: false, source: "swing" });
    expect(t.level).toBeCloseTo(104.3, 8);
  });

  it("offers the newer top the rally completes after the buy", () => {
    const D = daily([...zig(90, 96, 8), ...leg(90, 107, 10), 104, 102.5, 101.6, ...leg(101.6, 104, 2)], "2026-01-05");
    const t = computeGannEntryTrigger(D, "bullish", undefined, undefined, true, older)!;
    expect(t).toMatchObject({ held: false, source: "swing" });
    expect(t.level).toBeCloseTo(107.3, 8);
  });
});

describe("a level crossed, broken and crossed again", () => {
  it("is dated by the later crossing, which is the live one", () => {
    // 2025's top at 100 is crossed in January and broken by the fall to 90;
    // the May rally crosses it again and reacts without reaching the buy.
    const M = monthly("2016-01", 125, (m) => (m === "2025-06" ? [100, 92] : m < "2025-01" ? [80, 70] : [95, 88]));
    const D = daily([...leg(98, 106, 6), ...leg(106, 90, 12), ...zig(90, 96, 6), ...leg(90, 107, 10), ...leg(107, 103.5, 3)], "2026-01-05");
    const chart = entryChart(D, M, "2026-06-01");
    const t = computeGannEntryTrigger(chart.bars, "bullish", undefined, undefined, true, chart.older)!;
    expect(t).toMatchObject({ held: true, source: "priorYear", level: 100 });
    expect(t.crossedAt! > D[30].t).toBe(true);
  });
});

describe("one level read twice (R2, R11)", () => {
  it("treats prices a cent apart, or within 0.1%, as one level", () => {
    expect(sameGannLevel(100, 100.01)).toBe(true);
    expect(sameGannLevel(1000, 1000.9)).toBe(true);
    expect(sameGannLevel(100, 100.2)).toBe(false);
  });

  it("names a swing top a cent off the previous year's top as that year's top, and does not offer it again once bought", () => {
    const d = daily([...leg(90, 99.7, 10), ...leg(99.7, 92, 45), ...leg(92, 106, 60)], "2025-10-06");
    const months = aggregate(d, ["2025-10", "2025-11", "2025-12", "2026-01"]).map((b) => (b.t.startsWith("2025-10") ? { ...b, h: b.h + 0.01 } : b));
    const m = [...monthly("2016-01", 117, () => [90, 85]), ...months];
    const older = olderGannLevels(m, "2026-06-01", "2025-06-02");
    expect(computeGannEntryTrigger(d, "bullish", undefined, undefined, true, older)).toMatchObject({ held: true, source: "priorYear", levelYear: 2025 });
    const bought = [...d, ...daily(leg(106, 100 + gannThreePoints(100) / 3 - 0.2, 2), new Date(Date.parse(d[d.length - 1].t) + DAY).toISOString().slice(0, 10))];
    expect(computeGannEntryTrigger(bought, "bullish", undefined, undefined, true, older)).toBeNull();
  });

  it("is bought once in the replay, though the next session names it by the monthly chart", () => {
    const flat = (c: number, n: number): Array<[number, number, number]> => Array.from({ length: n }, () => [c, c - 0.1, c + 0.1]);
    const path = (from: number, to: number, n: number) => leg(from, to, n).map((c) => [c, c - 0.1, c + 0.1] as [number, number, number]);
    const session = (day: string, p: Array<[number, number, number]>): Bar[] =>
      p.map(([c, l, h], i) => {
        const min = 14 * 60 + 30 + i * 15;
        return { t: `${day}T${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00Z`, o: c, h, l, c, v: 1000 };
      });
    const D0 = daily([...leg(90, 99.7, 10), ...leg(99.7, 92, 45), ...leg(92, 104, 50)], "2025-10-06");
    const last = D0[D0.length - 1].t.slice(0, 10);
    const [S, S1, S2] = ["2026-01-19", "2026-01-20", "2026-01-21"];
    const dailyBars: Bar[] = [
      ...D0,
      // The session that crosses the line does so on heavier volume, as a breakaway must (A-VOLUME-10).
      { t: `${S}T05:00:00Z`, o: 104, h: 105.6, l: 101.4, c: 105.3, v: 2e6 },
      { t: `${S1}T05:00:00Z`, o: 105.3, h: 105.6, l: 101.4, c: 104, v: 1e6 },
      { t: `${S2}T05:00:00Z`, o: 104, h: 104.5, l: 103.5, c: 104, v: 1e6 },
    ];
    const M = [...monthly("2016-01", 108, () => [130, 120]), ...monthly("2025-01", 9, () => [95, 88]), ...aggregate(dailyBars, ["2025-10", "2025-11", "2025-12", "2026-01"])];
    const exec: Bar[] = [
      ...session(last, flat(103.9, 40)),
      ...session(S, [...path(104, 105.3, 5), ...path(105.3, 101.5, 8), ...path(101.5, 105.3, 13)]),
      ...session(S1, [...path(105.3, 101.5, 10), ...path(101.5, 104, 16)]),
      ...session(S2, flat(104, 20)),
    ];
    const withMonthly = replay("TEST", exec, { targetR: 2, dailyBars, monthlyBars: M, entryRule: "reaction" });
    const without = replay("TEST", exec, { targetR: 2, dailyBars, entryRule: "reaction" });
    expect(without.trades).toHaveLength(1);
    expect(withMonthly.trades).toHaveLength(1);
  });
});

describe("the same span of years on every surface (R10)", () => {
  it(`reads only the ${OLDER_LEVELS_YEARS} calendar years before the day`, () => {
    // A 2010 record of 300 is older than the span; the record is then 2016-2025's.
    const M = monthly("2010-01", 197, (m) => (m === "2010-06" ? [300, 250] : m === "2017-02" ? [130, 110] : [100, 80]));
    const levels = olderGannLevels(M, "2026-06-01", "2025-06-02");
    expect(levels.find((l) => l.source === "allTime" && l.kind === "top")?.price).toBe(130);
    expect(Math.min(...levels.filter((l) => l.source === "priorYear").map((l) => l.year!))).toBe(2016);
    expect(monthlyChartFrom(new Date("2026-06-01T00:00:00Z"))).toEqual(jan1(2016));
  });

  beforeEach(() => {
    fetched.calls = [];
    fetched.daily = [];
    fetched.monthly = [];
    resetGannExitCache();
  });
  const monthlyStart = () => fetched.calls.find((c) => c.timeframe === "1Month")!.start.getTime();
  const yearOf = (ms: number) => new Date(ms).getUTCFullYear();

  it("the replay fetches the span before its first daily session", async () => {
    await fetchSeries("AAPL", "15Min", true);
    expect(monthlyStart()).toBeLessThanOrEqual(jan1(yearOf(Date.now() - TF_LOOKBACK_DAYS["1Day"] * DAY) - OLDER_LEVELS_YEARS).getTime());
  });

  it("confirmation and the live exit fetch the span before the year they read", async () => {
    const now = new Date("2026-10-15T15:00:00Z");
    await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 95, now });
    expect(monthlyStart()).toBeLessThanOrEqual(jan1(2025 - OLDER_LEVELS_YEARS).getTime());
    fetched.calls = [];
    await readLiveGannExit({ symbol: "AAPL", side: "long", entryPrice: 101, initialStop: 95, openedAt: "2026-09-15T15:00:00Z", best: 103, now });
    expect(monthlyStart()).toBeLessThanOrEqual(jan1(2024 - OLDER_LEVELS_YEARS).getTime());
  });

  it("the exam fetches the span before each scenario's day", async () => {
    const service = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "order", "limit"]) chain[k] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "stub" } }) }) });
        return chain;
      },
    } as unknown as SupabaseClient;
    await startAttempt(service, "user-1", "novice_to_pro", new Date("2026-06-01T12:00:00Z"));
    const months = fetched.calls.filter((c) => c.timeframe === "1Month");
    expect(months.length).toBeGreaterThan(0);
    for (const c of months) expect(c.start.getTime()).toBeLessThanOrEqual(jan1(c.end!.getUTCFullYear() - OLDER_LEVELS_YEARS).getTime());
  });
});
