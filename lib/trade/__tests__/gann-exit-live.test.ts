import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { bestSinceFill, readGannExitFromBars } from "@/lib/trade/gann-exit-live";

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({
    t: new Date(t0 + i * 86_400_000).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1_000_000,
  }));
}

describe("readGannExitFromBars", () => {
  // Swings up and down, then a push higher after the entry day.
  const closes = [100, 103, 106, 103, 100, 97, 100, 104, 108, 104, 100, 98, 101, 105, 110, 112, 111, 113];
  const bars = days(closes);
  const entryDay = bars[14].t;

  it("skips the hold test when the entry never crossed the old top", () => {
    // An entry below the last swing top crossed nothing, so it can't fail to hold it.
    // Opened during Monday's session, so the trade is still in its entry week
    // and the weekly trail (A-STOP-05) has nothing to move yet.
    const r = readGannExitFromBars(
      { symbol: "TEST", side: "long", entryPrice: 95, initialStop: 89, openedAt: "2026-06-15T15:00:00Z", best: 96 },
      bars.slice(0, 16),
      null,
    );
    expect(r.stop).toBe(89);
    expect(r.exit).toBeNull();
  });

  it("moves the stop to break-even after a gain equal to the risk", () => {
    const r = readGannExitFromBars(
      { symbol: "TEST", side: "long", entryPrice: 110, initialStop: 104, openedAt: entryDay, best: 117 },
      bars,
      null,
    );
    expect(r.stop).toBeGreaterThanOrEqual(110);
  });
});

describe("bestSinceFill (2026-10-29, CBOE)", () => {
  // 15-minute bars on Wed 2026-10-28, New York time (UTC-4): 9:30, 9:45, 10:00, 10:15, 10:30.
  const bar = (t: string, h: number, l: number): Bar => ({ t, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 10_000 });
  const bars: Bar[] = [
    bar("2026-10-28T12:00:00Z", 340, 300), // 8:00 AM pre-market: never read for a stock
    bar("2026-10-28T13:30:00Z", 333, 318), // 9:30, before the fill
    bar("2026-10-28T13:45:00Z", 331, 319), // 9:45: opened before the 9:54 fill
    bar("2026-10-28T14:00:00Z", 330.9, 320.1), // 10:00
    bar("2026-10-28T14:15:00Z", 329, 317.5), // 10:15
    bar("2026-10-28T14:30:00Z", 345, 300), // 10:30: still forming at 10:40
  ];
  const fill = "2026-10-28T13:54:25Z";
  const now = new Date("2026-10-28T14:40:00Z");

  it("reads only closed regular-session bars that opened at or after the fill", () => {
    expect(bestSinceFill("long", bars, fill, now, false)).toBe(330.9);
    expect(bestSinceFill("short", bars, fill, now, false)).toBe(317.5);
  });

  it("is null before any bar since the fill has closed", () => {
    expect(bestSinceFill("long", bars, fill, new Date("2026-10-28T14:10:00Z"), false)).toBeNull();
  });

  it("reads every hour for crypto", () => {
    const crypto = [bar("2026-10-28T02:00:00Z", 70_000, 69_000)];
    expect(bestSinceFill("long", crypto, "2026-10-28T01:50:00Z", now, true)).toBe(70_000);
  });
});
