/**
 * The live scan, the replay and the graduation exam read a buying point from
 * the same window (`entryChart`, PLAN.md item 5): each passes it the day it
 * prices for, and prices from what it returns, the 52 weeks of daily sessions
 * and the monthly chart's older levels (step 3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const spies = vi.hoisted(() => ({ entryChart: vi.fn(), selectGannEntry: vi.fn(), readBreakaway: vi.fn(), gannEntryOf: vi.fn() }));
vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  spies.entryChart.mockImplementation(actual.entryChart);
  spies.gannEntryOf.mockImplementation(actual.gannEntryOf);
  return { ...actual, entryChart: spies.entryChart, gannEntryOf: spies.gannEntryOf };
});
vi.mock("@/lib/gann/entryTrigger", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gann/entryTrigger")>("@/lib/gann/entryTrigger");
  spies.selectGannEntry.mockImplementation(actual.selectGannEntry);
  return { ...actual, selectGannEntry: spies.selectGannEntry };
});

vi.mock("@/lib/gann/breakaway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gann/breakaway")>("@/lib/gann/breakaway");
  spies.readBreakaway.mockImplementation(actual.readBreakaway);
  return { ...actual, readBreakaway: spies.readBreakaway };
});

import { buildScenario } from "@/lib/school/graduationExam";
import { replay } from "@/lib/backtest/replay";
import { scanTicker } from "@/lib/scanTicker";
import { etDateKey } from "@/lib/market/session";

const DAY_MS = 86_400_000;
function zigzag(count: number, before: string): Bar[] {
  const end = Date.parse(`${before}T00:00:00Z`);
  return Array.from({ length: count }, (_, k) => {
    const i = count - k;
    const phase = k % 8;
    const c = 96 + (phase < 4 ? phase : 7 - phase) * 2 + k * 0.05;
    return { t: new Date(end - i * DAY_MS).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 };
  });
}

/** Whether every call of `spy` read the bars of one of the charts handed back, with its older levels. */
function readFromWindow(spy = spies.selectGannEntry, withOlder = spy === spies.selectGannEntry): boolean {
  const charts = spies.entryChart.mock.results.map((r) => r.value as { bars: Bar[]; older: unknown[] });
  return (
    spy.mock.calls.length > 0 &&
    spy.mock.calls.every(([bars, , older]) => charts.some((c) => c.bars === bars && (!withOlder || c.older === older)))
  );
}

/** Whether every buying point was priced with the scan's own monthly, weekly and daily trends (the rally sale's bear market). */
function pricedOnMacroTrends(): boolean {
  return (
    spies.gannEntryOf.mock.calls.length > 0 &&
    spies.gannEntryOf.mock.calls.every(([, , trends]) =>
      ["1Month", "1Week", "1Day"].every((tf) => (trends as { timeframe: string }[]).some((t) => t.timeframe === tf)),
    )
  );
}

beforeEach(() => {
  spies.gannEntryOf.mockClear();
  spies.entryChart.mockClear();
  spies.selectGannEntry.mockClear();
  spies.readBreakaway.mockClear();
});

describe("the window each surface reads", () => {
  it("the exam: the day the scenario is set", () => {
    const daily = zigzag(400, "2026-06-20");
    const monthly = daily.filter((_, i) => i % 21 === 0);
    const asOf = "2026-06-10";
    buildScenario("TEST", asOf, daily, 1, monthly);
    expect(spies.entryChart).toHaveBeenCalledWith(daily, monthly, asOf);
    expect(readFromWindow()).toBe(true);
  });

  it("the replay: the session being armed", () => {
    const day = "2026-06-15";
    const daily = zigzag(300, day);
    const bars: Bar[] = Array.from({ length: 50 }, (_, i) => {
      const m = i * 15;
      const c = 100 + (i % 2 ? 0.1 : -0.1);
      return { t: `${day}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00Z`, o: c, h: c + 0.2, l: c - 0.2, c, v: 1000 };
    });
    const monthlyBars = daily.filter((_, i) => i % 21 === 0);
    replay("TEST", bars, { targetR: 2, dailyBars: daily, monthlyBars, entryRule: "reaction" });
    expect(spies.entryChart).toHaveBeenCalledWith(daily, monthlyBars, day);
    expect(readFromWindow()).toBe(true);
    // The breakaway hold reads the same bars as the entry it holds.
    expect(readFromWindow(spies.readBreakaway)).toBe(true);
    // A rally is sold only on the main trend's say (A-ENTRY-18, gannEntryOf).
    expect(spies.selectGannEntry.mock.calls.every((c) => typeof c[4] === "boolean")).toBe(true);
    expect(pricedOnMacroTrends()).toBe(true);
  });

  describe("the live scan", () => {
    const original = process.env.MARKET_DATA_PROVIDER;
    beforeEach(() => {
      process.env.MARKET_DATA_PROVIDER = "synthetic";
    });
    afterEach(() => {
      process.env.MARKET_DATA_PROVIDER = original;
    });

    it("today, with the session still forming left out", async () => {
      await scanTicker("AAPL");
      expect(spies.entryChart).toHaveBeenCalledTimes(1);
      const [, monthly, asOf] = spies.entryChart.mock.calls[0];
      expect(asOf).toBe(etDateKey(new Date()));
      // The scan's own monthly chart, not an empty one.
      expect((monthly as Bar[]).length).toBeGreaterThan(12);
      expect(readFromWindow()).toBe(true);
      expect(readFromWindow(spies.readBreakaway)).toBe(true);
      expect(spies.selectGannEntry.mock.calls.every((c) => typeof c[4] === "boolean")).toBe(true);
      expect(pricedOnMacroTrends()).toBe(true);
    }, 30_000);

    it("arms the side the replay arms, by the same rule (item 6 step 11)", async () => {
      const { gannEntryOf, reversionEntry } = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
      const symbols = ["AAPL", "MSFT", "XOM", "JPM", "KO", "TSLA", "NVDA", "PFE"];
      const sides = new Set<string>();
      for (const symbol of symbols) {
        spies.entryChart.mockClear();
        const r = await scanTicker(symbol);
        const chart = spies.entryChart.mock.results[0].value as { bars: Bar[]; older: Parameters<typeof gannEntryOf>[1] };
        const macro = r.trends.filter((t) => t.timeframe !== "1Hour");
        const expected = reversionEntry(macro, gannEntryOf(chart.bars, chart.older, macro), chart.bars[chart.bars.length - 1].c);
        expect(r.direction).toBe(expected?.direction ?? "none");
        sides.add(r.direction);
      }
      expect(sides.size).toBeGreaterThan(1);
    }, 60_000);
  });
});
