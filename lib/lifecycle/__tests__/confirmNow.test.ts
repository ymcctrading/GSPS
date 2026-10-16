import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const fetchBars = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchBars }) }));

import { closedSessionBars, confirmationFromBars, heldOnDailyChart, readEntryConfirmationNow } from "../confirmNow";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";

const Q = 15 * 60 * 1000;
function bar(t: string, o: number, h: number, l: number, c: number): Bar {
  return { t, o, h, l, c, v: 1000 };
}

describe("closedSessionBars", () => {
  it("keeps only the latest session's closed bars", () => {
    const bars = [
      bar("2026-09-24T19:45:00Z", 1, 1, 1, 1),
      bar("2026-09-25T13:30:00Z", 1, 1, 1, 1),
      bar("2026-09-25T13:45:00Z", 1, 1, 1, 1),
      bar("2026-09-25T14:00:00Z", 1, 1, 1, 1), // still forming at 14:10
    ];
    const out = closedSessionBars(bars, new Date("2026-09-25T14:10:00Z"), Q);
    expect(out.map((b) => b.t)).toEqual(["2026-09-25T13:30:00Z", "2026-09-25T13:45:00Z"]);
  });
});

describe("confirmationFromBars", () => {
  const T = 100;
  it("reports the stage reached and is ready only after the full sequence", () => {
    const touch = bar("2026-09-25T13:30:00Z", 99, 100.1, 98.8, 99.5);
    const brk = bar("2026-09-25T13:45:00Z", 99.5, 101, 99.4, 100.8);
    const retest = bar("2026-09-25T14:00:00Z", 100.8, 100.9, 99.9, 100.3);
    const hold = bar("2026-09-25T14:15:00Z", 100.3, 101.5, 100.2, 101.4);
    expect(confirmationFromBars([touch], "bullish", T).stage).toBe("touched");
    expect(confirmationFromBars([touch, brk], "bullish", T).stage).toBe("broken");
    expect(confirmationFromBars([touch, brk, retest], "bullish", T).stage).toBe("retested");
    const done = confirmationFromBars([touch, brk, retest, hold], "bullish", T);
    expect(done.ready).toBe(true);
    expect(done.stage).toBe("confirmed");
  });

  it("is not ready when price never reached the level", () => {
    const r = confirmationFromBars([bar("2026-09-25T13:30:00Z", 95, 96, 94, 95)], "bullish", T);
    expect(r).toMatchObject({ ready: false, stage: "not_touched" });
  });
});

describe("readEntryConfirmationNow under the 3-point crossing rule", () => {
  // Entry 101, stop 97: the crossing line is 103 (PLAN.md item 4).
  const yesterday = bar("2026-10-14T19:45:00Z", 103, 103.4, 102.5, 103.2);
  const today = bar("2026-10-15T14:30:00Z", 103, 102.4, 100.9, 101.2);
  const now = new Date("2026-10-15T15:00:00Z");

  it("counts a crossing close from an earlier session for an order with no plan", async () => {
    fetchBars.mockResolvedValue([yesterday, today]);
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97, now });
    expect(r.ready).toBe(true);
  });

  it("counts a crossing made before the plan was generated", async () => {
    fetchBars.mockResolvedValue([yesterday, today]);
    const r = await readEntryConfirmationNow({
      symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97,
      since: "2026-10-15T14:00:00Z", now,
    });
    expect(r.ready).toBe(true);
  });

  it("keeps today's session only for the retest-and-hold sequence", async () => {
    fetchBars.mockResolvedValue([yesterday, today]);
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, now });
    expect(r.ready).toBe(false);
  });
});

describe("readEntryConfirmationNow: leaving a range on volume (A-VOLUME-10)", () => {
  // Entry 101, stop 97: the crossing line is 103. Thirty completed sessions
  // swing between 96 and 102, a market with no confirmed trend.
  const now = new Date("2026-10-15T15:00:00Z");
  const yesterday = bar("2026-10-14T19:45:00Z", 103, 103.4, 102.5, 103.2);
  const today = bar("2026-10-15T14:30:00Z", 103, 102.4, 100.9, 101.2);
  const end = Date.parse("2026-10-13T04:00:00Z");
  const range: Bar[] = Array.from({ length: 30 }, (_, i) => {
    const phase = i % 8;
    const c = 96 + (phase < 4 ? phase : 7 - phase) * 2;
    return { t: new Date(end - (29 - i) * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const crossDay = (v: number): Bar => ({ t: "2026-10-14T04:00:00Z", o: 102, h: 103.6, l: 101.8, c: 103.2, v });
  const byTimeframe = (day: Bar[]) => fetchBars.mockImplementation(async (_s: string, tf: string) => (tf === "1Day" ? day : [yesterday, today]));
  const read = () => readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97, now });

  it("is ready when the session that left the range closed past the line on more than its volume", async () => {
    byTimeframe([...range, crossDay(2e6)]);
    expect((await read()).ready).toBe(true);
  });

  it("waits when that session closed past the line on no more than the range's volume", async () => {
    byTimeframe([...range, crossDay(1e6)]);
    const r = await read();
    expect(r).toMatchObject({ ready: false, stage: "broken" });
    expect(r.note).toMatch(/volume/);
  });

  it("waits when no completed session has closed past the line yet", async () => {
    byTimeframe(range);
    expect((await read()).ready).toBe(false);
  });
  it("does not count the session still trading, however heavy its volume so far (review M5, BV9)", async () => {
    const forming: Bar = { t: "2026-10-15T04:00:00Z", o: 102, h: 103.6, l: 101.8, c: 103.2, v: 9e6 };
    byTimeframe([...range, forming]);
    expect((await read()).ready).toBe(false);
  });

  it("asks no volume of a resting buy at an old bottom inside the range (review M5, BV12)", async () => {
    byTimeframe(range);
    const r = await readEntryConfirmationNow({
      symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 96, stopPrice: 92, entryKind: "oldLevel", now,
    });
    expect(r.ready).toBe(true);
  });
});

describe("readEntryConfirmationNow: the window under the 3-point crossing rule", () => {
  const now = new Date("2026-10-15T15:00:00Z");
  const today = bar("2026-10-15T14:30:00Z", 103, 102.4, 100.9, 101.2);
  const byTimeframe = (execution: Bar[], day: Bar[] = []) =>
    fetchBars.mockImplementation(async (_s: string, tf: string) => (tf === "1Day" ? day : execution));

  it("reads a crossing three days back for an order with no plan", async () => {
    byTimeframe([bar("2026-10-12T19:45:00Z", 103, 103.4, 102.5, 103.2), today]);
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97, now });
    expect(r.ready).toBe(true);
  });

  it("leaves out bars older than the window even when the feed returns them", async () => {
    byTimeframe([bar("2026-10-05T19:45:00Z", 103, 103.4, 102.5, 103.2), today]);
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: 101, stopPrice: 97, now });
    expect(r.ready).toBe(false);
  });
});

describe("the completed daily chart, for a reaction longer than the window", () => {
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  // An old top near 50 crossed by 3 points on the way to 56, then a reaction
  // to 52 that has not reached the buy near 51.2. Dated to end yesterday.
  const closes = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 56, 8), ...leg(56, 52, 4)];
  const end = Date.parse("2026-10-14T04:00:00Z");
  // The advance out of the range runs on heavier volume, as a breakaway must.
  const daily: Bar[] = closes.map((c, i) => ({ t: new Date(end - (closes.length - 1 - i) * 86_400_000).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: i >= 10 && i < 18 ? 2e6 : 1e6 }));
  const now = new Date("2026-10-15T15:00:00Z");
  const t = computeGannEntryTrigger(daily, "bullish")!;

  it("is ready when the level still holds there and is the one this order buys", async () => {
    expect(t.held).toBe(true);
    expect(heldOnDailyChart(daily, now, "bullish", Math.round(t.reactionEntry * 100) / 100)).toBe(true);
    fetchBars.mockImplementation(async (_s: string, tf: string) => (tf === "1Day" ? daily : [bar("2026-10-15T14:30:00Z", 52, 52.3, 51.8, 52)]));
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: t.reactionEntry, stopPrice: t.reactionStop, now });
    expect(r.ready).toBe(true);
  });

  it("waits when the session that left the range closed on no more than the range's volume", async () => {
    const flat = daily.map((b) => ({ ...b, v: 1e6 }));
    const ft = computeGannEntryTrigger(flat, "bullish")!;
    expect(heldOnDailyChart(flat, now, "bullish", Math.round(ft.reactionEntry * 100) / 100)).toBe(true);
    fetchBars.mockImplementation(async (_s: string, tf: string) => (tf === "1Day" ? flat : [bar("2026-10-15T14:30:00Z", 52, 52.3, 51.8, 52)]));
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: ft.reactionEntry, stopPrice: ft.reactionStop, now });
    expect(r.ready).toBe(false);
    expect(r.stage).toBe("broken");
    expect(r.note).toMatch(/volume/);
  });

  it("is off when a close today went through the stop, though the daily chart still holds", async () => {
    fetchBars.mockImplementation(async (_s: string, tf: string) =>
      tf === "1Day" ? daily : [bar("2026-10-15T14:30:00Z", 52, 52.3, t.reactionStop - 2, t.reactionStop - 1.5)],
    );
    const r = await readEntryConfirmationNow({ symbol: "AAPL", assetClass: "us_equity", direction: "bullish", entryTrigger: t.reactionEntry, stopPrice: t.reactionStop, now });
    expect(r.ready).toBe(false);
    expect(r.stage).toBe("dead");
  });

  it("is not ready for a different level's buy", () => {
    expect(heldOnDailyChart(daily, now, "bullish", t.reactionEntry + 1)).toBe(false);
  });

  it("does not let the day still forming cross the level", () => {
    // Without the final bar of the crossing, nothing is held; a forming day
    // carrying the crossing close is left out.
    const before = daily.slice(0, 16);
    const forming: Bar = { ...daily[16], t: "2026-10-15T04:00:00Z" };
    expect(computeGannEntryTrigger([...before, forming], "bullish")?.held).toBe(true);
    expect(heldOnDailyChart([...before, forming], now, "bullish", t.reactionEntry)).toBe(false);
  });
});

describe("readEntryConfirmationNow: a long waits while a distribution breakdown stands (A-VOLUME-03)", () => {
  // Top 100, lower top 95, a dull narrow spell near 82, broken to 74 on heavy
  // volume, then one session at 75: the breakdown stands on 2026-10-15.
  const closes: number[] = [];
  for (let i = 0; i <= 20; i++) closes.push(70 + 1.5 * i);
  for (let i = 1; i <= 15; i++) closes.push(100 - i);
  for (let i = 1; i <= 12; i++) closes.push(85 + ((95 - 85) * i) / 12);
  for (let i = 1; i <= 15; i++) closes.push(95 - ((95 - 82) * i) / 15);
  const spellStart = closes.length;
  for (let i = 0; i < 30; i++) closes.push(82 + (i % 2 ? 0.5 : -0.5));
  const breakAt = closes.length;
  closes.push(74, 75);
  const daily = (breakVolume: number): Bar[] =>
    closes.map((c, i) => ({
      t: new Date(Date.parse("2026-10-14T04:00:00Z") - (closes.length - 1 - i) * 86_400_000).toISOString(),
      o: c, h: c + 0.5, l: c - 0.5, c,
      v: i === breakAt ? breakVolume : i < spellStart ? 2e6 : i % 2 ? 1.5e6 : 1e6,
    }));
  const now = new Date("2026-10-15T15:00:00Z");
  const execution = [bar("2026-10-15T14:30:00Z", 75.5, 76, 75, 75.5)];
  const read = (day: Bar[], direction: "bullish" | "bearish" = "bullish") => {
    fetchBars.mockImplementation(async (_s: string, tf: string) => (tf === "1Day" ? day : execution));
    return readEntryConfirmationNow({
      symbol: "AAPL", assetClass: "us_equity", direction, entryTrigger: 75, stopPrice: direction === "bullish" ? 70 : 80, entryKind: "oldLevel", now,
    });
  };

  it("waits on a long that would otherwise be ready", async () => {
    const r = await read(daily(2.5e6));
    expect(r).toMatchObject({ ready: false, stage: "broken" });
    expect(r.note).toMatch(/broke down on volume/);
  });

  it("is ready on the same long when the break came on light volume", async () => {
    expect((await read(daily(1.2e6))).ready).toBe(true);
  });
});
