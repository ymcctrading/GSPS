import { describe, it, expect } from "vitest";
import { earliestSession, pairNewsWithSessions } from "../symbolNews";
import { etDateKey, etParts } from "@/lib/market/session";
import type { Bar } from "@/lib/types";

function etStamp(iso: string): string {
  const d = new Date(iso);
  const m = etParts(d).minutes;
  return `${etDateKey(d)} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** An equity daily bar as Alpaca stamps it: the New York date's midnight (04:00Z in EDT). */
function eq(date: string, c: number): Bar {
  return { t: `${date}T04:00:00Z`, o: c, h: c, l: c, c, v: 1 } as Bar;
}
function cr(date: string, c: number): Bar {
  return { t: `${date}T00:00:00Z`, o: c, h: c, l: c, c, v: 1 } as Bar;
}

describe("earliestSession", () => {
  it("puts an equity item from the 4 PM close onward on the next day", () => {
    expect(earliestSession("2026-10-27T19:59:00Z", false, etStamp)).toBe("2026-10-27"); // 3:59 PM EDT
    expect(earliestSession("2026-10-27T20:00:00Z", false, etStamp)).toBe("2026-10-28"); // 4:00 PM EDT
    expect(earliestSession("2026-10-28T02:30:00Z", false, etStamp)).toBe("2026-10-28"); // 10:30 PM on the 27th
  });
  it("reads a crypto item by its UTC day", () => {
    expect(earliestSession("2026-10-28T02:30:00Z", true, etStamp)).toBe("2026-10-28");
    expect(earliestSession("2026-10-27T23:30:00Z", true, etStamp)).toBe("2026-10-27");
  });
  it("reads an early close's 1 PM as the close", () => {
    const closeAt = (d: string) => (d === "2026-11-27" ? "13:00" : "16:00");
    expect(earliestSession("2026-11-27T18:30:00Z", false, etStamp, closeAt)).toBe("2026-11-28"); // 1:30 PM EST
    expect(earliestSession("2026-11-27T17:30:00Z", false, etStamp, closeAt)).toBe("2026-11-27"); // 12:30 PM EST
  });
  it("returns null for a bad timestamp", () => {
    expect(earliestSession("not a date", false, etStamp)).toBeNull();
  });
});

describe("pairNewsWithSessions", () => {
  const daily = [eq("2026-10-22", 100), eq("2026-10-23", 98), eq("2026-10-26", 99), eq("2026-10-27", 103.95)];

  it("pairs each item with its session's close and change, newest first", () => {
    const rows = pairNewsWithSessions({
      daily,
      crypto: false,
      etStamp,
      news: [
        { createdAt: "2026-10-23T14:00:00Z", headline: "Friday morning" },
        { createdAt: "2026-10-27T15:00:00Z", headline: "Tuesday" },
      ],
    });
    expect(rows.map((r) => r.headline)).toEqual(["Tuesday", "Friday morning"]);
    expect(rows[0]).toMatchObject({ session: "2026-10-27", close: 103.95 });
    expect(rows[0].changePct).toBeCloseTo(0.05, 10);
    expect(rows[1]).toMatchObject({ session: "2026-10-23", close: 98, change: -2 });
  });

  it("carries a weekend or after-close item to the next session", () => {
    const rows = pairNewsWithSessions({
      daily,
      crypto: false,
      etStamp,
      news: [
        { createdAt: "2026-10-24T15:00:00Z", headline: "Saturday" },
        { createdAt: "2026-10-23T21:00:00Z", headline: "Friday after the close" },
      ],
    });
    expect(rows.map((r) => r.session)).toEqual(["2026-10-26", "2026-10-26"]);
    expect(rows[0].change).toBe(1);
  });

  it("leaves an item whose session has not closed without a close", () => {
    const [row] = pairNewsWithSessions({
      daily,
      crypto: false,
      etStamp,
      news: [{ createdAt: "2026-10-28T14:00:00Z", headline: "Today" }],
    });
    expect(row).toMatchObject({ session: null, close: null, change: null, changePct: null });
  });

  it("gives no change for the first session it holds", () => {
    const [row] = pairNewsWithSessions({
      daily,
      crypto: false,
      etStamp,
      news: [{ createdAt: "2026-10-21T14:00:00Z", headline: "Before the record" }],
    });
    expect(row).toMatchObject({ session: "2026-10-22", close: 100, change: null, changePct: null });
  });

  it("reads crypto by UTC day and drops bad timestamps", () => {
    const rows = pairNewsWithSessions({
      daily: [cr("2026-10-27", 50), cr("2026-10-28", 55)],
      crypto: true,
      etStamp,
      news: [
        { createdAt: "2026-10-28T02:30:00Z", headline: "Late evening in New York" },
        { createdAt: "garbage", headline: "Bad" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ session: "2026-10-28", close: 55, change: 5 });
  });
});
