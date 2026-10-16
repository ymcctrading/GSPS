/**
 * The surfaces that fetch their own bars fetch the monthly chart too, so a
 * buying point on a previous year's top (PLAN.md item 5, step 3) is confirmed,
 * exited and examined on the level the scan priced it from.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const fixtures = vi.hoisted(() => ({ daily: [] as Bar[], monthly: [] as Bar[], execution: [] as Bar[] }));
vi.mock("@/lib/data/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/provider")>("@/lib/data/provider");
  const fetchBars = async (_symbol: string, timeframe: string) =>
    timeframe === "1Day" ? fixtures.daily : timeframe === "1Month" ? fixtures.monthly : fixtures.execution;
  return { ...actual, getMarketDataProvider: () => ({ ...actual.getMarketDataProvider(), fetchBars }) };
});
vi.mock("@/lib/data/instrumentReference", () => ({ getInstrumentReference: async () => null }));
const buildScenario = vi.hoisted(() => vi.fn());
vi.mock("@/lib/school/graduationExam", async () => {
  const actual = await vi.importActual<typeof import("@/lib/school/graduationExam")>("@/lib/school/graduationExam");
  buildScenario.mockImplementation(actual.buildScenario);
  return { ...actual, buildScenario };
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { selectGannEntry } from "@/lib/gann/entryTrigger";
import { entryChart } from "@/lib/scan/entrySelection";
import { readEntryConfirmationNow } from "@/lib/lifecycle/confirmNow";
import { readLiveGannExit, resetGannExitCache } from "@/lib/trade/gann-exit-live";
import { startAttempt } from "@/lib/school/examService";

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
// The advance out of the 90-96 range runs on heavier volume, as a breakaway must.
const D = daily([...zig(90, 96, 8), ...leg(90, 107, 10), ...leg(107, 103.5, 3)], "2026-01-05").map((b, i) => (i >= 80 && i < 90 ? { ...b, v: 2e6 } : b));
const ASOF = "2026-06-01";
const chart = entryChart(D, M, ASOF);
const T = selectGannEntry(chart.bars, "bullish", chart.older)!;

beforeEach(() => {
  fixtures.daily = D;
  fixtures.monthly = M;
  fixtures.execution = [];
  resetGannExitCache();
});

describe("fetching the monthly chart", () => {
  it("prices from the previous year's top in this fixture", () => {
    expect(T).toMatchObject({ source: "priorYear", held: true, level: 100 });
  });

  it("confirmation: an order at the scan's reaction buy is ready on the held level once a bar reacts into the zone", async () => {
    // A closed bar this morning trades down to the buy (never-failing rule 9).
    const e = T.reactionEntry;
    fixtures.execution = [{ t: `${ASOF}T14:30:00Z`, o: e + 0.5, h: e + 0.6, l: e - 0.1, c: e + 0.2, v: 1000 }];
    const r = await readEntryConfirmationNow({
      symbol: "TEST", assetClass: "us_equity", direction: "bullish",
      entryTrigger: T.reactionEntry, stopPrice: T.reactionStop, now: new Date(`${ASOF}T15:00:00Z`),
    });
    expect(r.ready).toBe(true);
  });

  it("the live exit: a close 3 points back under the previous year's top ends the trade", async () => {
    // Bought on 2026-04-13, then a close at 93.5: under 100 by more than 3
    // points, but not under the swing top the rally also crossed.
    const after = daily([102, 99, 93.5], "2026-04-13");
    fixtures.daily = [...D, ...after];
    expect(93.5).toBeLessThan(100 - gannThreePoints(100));
    const r = await readLiveGannExit({
      symbol: "TEST", side: "long", entryPrice: T.reactionEntry, initialStop: T.reactionStop,
      openedAt: "2026-04-13T15:00:00Z", best: 102, now: new Date("2026-04-20T15:00:00Z"),
    });
    expect(r?.exit?.reason).toBe("hold_test_failed");
  });

  it("the exam: each scenario is built with the monthly chart fetched for it", async () => {
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
    expect(buildScenario).toHaveBeenCalled();
    expect(buildScenario.mock.calls.every((c) => c[4] === M)).toBe(true);
  });
});
