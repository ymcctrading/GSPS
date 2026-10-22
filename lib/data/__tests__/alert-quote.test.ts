import { describe, expect, it } from "vitest";
import { alertQuoteFromSnapshot } from "@/lib/data/alpaca";

// Thursday 2026-10-22, New York time (EDT, UTC-4).
const PRE = new Date("2026-10-22T12:00:00Z"); // 8:00 AM
const OPEN = new Date("2026-10-22T15:00:00Z"); // 11:00 AM
const AFTER = new Date("2026-10-22T21:00:00Z"); // 5:00 PM

const today = { t: "2026-10-22T04:00:00Z", h: 51, l: 49, c: 50.5, v: 900_000 };
const yesterday = { t: "2026-10-21T04:00:00Z", h: 50, l: 48, c: 49.5, v: 1_000_000 };

describe("alertQuoteFromSnapshot", () => {
  it("during the session: today's bar is forming, the completed close is yesterday's", () => {
    const q = alertQuoteFromSnapshot(
      { latestTrade: { p: 50.6 }, latestQuote: { bp: 50.55, ap: 50.65 }, dailyBar: today, prevDailyBar: { c: 49.5 } },
      "us_equity",
      OPEN,
    );
    expect(q).toMatchObject({ last: 50.6, bid: 50.55, ask: 50.65, dayHigh: 51, dayLow: 49, dayVolume: 900_000 });
    expect(q.completedClose).toBe(49.5);
    expect(q.changeFrom).toBe(49.5);
  });

  it("after the close: today's close is completed, the change still runs from yesterday", () => {
    const q = alertQuoteFromSnapshot({ latestTrade: { p: 50.4 }, dailyBar: today, prevDailyBar: { c: 49.5 } }, "us_equity", AFTER);
    expect(q.completedClose).toBe(50.5);
    expect(q.changeFrom).toBe(49.5);
  });

  it("before today's first daily bar: yesterday's bar is the completed close and today has no range", () => {
    const q = alertQuoteFromSnapshot({ latestTrade: { p: 49.8 }, dailyBar: yesterday, prevDailyBar: { c: 49 } }, "us_equity", PRE);
    expect(q.completedClose).toBe(49.5);
    expect(q.changeFrom).toBe(49.5);
    expect(q.dayHigh).toBeNull();
    expect(q.dayVolume).toBeNull();
  });

  it("drops an empty side of the book; crypto's daily bar is always forming", () => {
    const q = alertQuoteFromSnapshot(
      { latestTrade: { p: 60000 }, latestQuote: { bp: 0, ap: 60010 }, dailyBar: today, prevDailyBar: { c: 59000 } },
      "crypto",
      AFTER,
    );
    expect(q.bid).toBeNull();
    expect(q.ask).toBe(60010);
    expect(q.completedClose).toBe(59000);
    expect(q.dayHigh).toBe(51);
  });
});
