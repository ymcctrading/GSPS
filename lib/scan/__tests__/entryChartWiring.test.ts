/**
 * The live scan, the replay and the graduation exam read a buying point from
 * the same window (`entryChartBars`, PLAN.md item 5): each passes it the day
 * it prices for, and prices from what it returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const spies = vi.hoisted(() => ({ entryChartBars: vi.fn(), selectGannEntry: vi.fn(), readBreakaway: vi.fn() }));
vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  spies.entryChartBars.mockImplementation(actual.entryChartBars);
  return { ...actual, entryChartBars: spies.entryChartBars };
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

/** Whether every call of `spy` read one of the arrays the window handed back. */
function readFromWindow(spy = spies.selectGannEntry): boolean {
  const windows = spies.entryChartBars.mock.results.map((r) => r.value);
  return spy.mock.calls.length > 0 && spy.mock.calls.every(([bars]) => windows.includes(bars));
}

beforeEach(() => {
  spies.entryChartBars.mockClear();
  spies.selectGannEntry.mockClear();
  spies.readBreakaway.mockClear();
});

describe("the window each surface reads", () => {
  it("the exam: the day the scenario is set", () => {
    const daily = zigzag(400, "2026-06-20");
    const asOf = "2026-06-10";
    buildScenario("TEST", asOf, daily, 1);
    expect(spies.entryChartBars).toHaveBeenCalledWith(daily, asOf);
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
    replay("TEST", bars, { targetR: 2, dailyBars: daily, entryRule: "reaction" });
    expect(spies.entryChartBars).toHaveBeenCalledWith(daily, day);
    expect(readFromWindow()).toBe(true);
    // The breakaway hold reads the same bars as the entry it holds.
    expect(readFromWindow(spies.readBreakaway)).toBe(true);
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
      expect(spies.entryChartBars).toHaveBeenCalledTimes(1);
      expect(spies.entryChartBars.mock.calls[0][1]).toBe(etDateKey(new Date()));
      expect(readFromWindow()).toBe(true);
      expect(readFromWindow(spies.readBreakaway)).toBe(true);
    }, 30_000);
  });
});
