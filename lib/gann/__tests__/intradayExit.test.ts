import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { hourlyTurnedAgainst, intradayTrail, isSessionLastBar, readIntradayExit, sessionCloseDue } from "@/lib/gann/intradayExit";
import { readIntradayExitFromBars } from "@/lib/trade/gann-exit-live";

/** 15-minute bars from 13:30 UTC (9:30 New York in October) walking `legs` of [bars, % move]. */
function walk(day: string, legs: [number, number][], start = 100, from = 0): Bar[] {
  const out: Bar[] = [];
  let price = start;
  let n = from;
  for (const [len, pct] of legs) {
    for (let i = 0; i < len; i++) {
      const o = price;
      const c = o * (1 + pct / len / 100);
      const mins = 13 * 60 + 30 + n * 15;
      const t = `${day}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00Z`;
      out.push({ t, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: 1000 });
      price = c;
      n++;
    }
  }
  return out;
}

const RISING: [number, number][] = [
  [4, 1],
  [3, -0.4],
  [4, 1],
  [3, -0.4],
  [4, 1],
  [3, -0.4],
];

describe("the Intraday style's session close", () => {
  const filled = new Date("2026-10-21T14:00:00Z"); // 10:00 New York
  it("is due from 3:45 PM New York time in the session, not before", () => {
    expect(sessionCloseDue(new Date("2026-10-21T19:00:00Z"), filled)).toBe(false); // 3:00 PM
    expect(sessionCloseDue(new Date("2026-10-21T19:50:00Z"), filled)).toBe(true); // 3:50 PM
  });
  it("is due at once when a close has passed since the fill (a pass that missed the last bar)", () => {
    expect(sessionCloseDue(new Date("2026-10-22T14:00:00Z"), filled)).toBe(true);
  });
  it("reads the session's last bar by its New York date", () => {
    const bars = [...walk("2026-10-21", [[26, 1]]), ...walk("2026-10-22", [[2, 1]])];
    expect(isSessionLastBar(bars, 25)).toBe(true);
    expect(isSessionLastBar(bars, 24)).toBe(false);
    expect(isSessionLastBar(bars, bars.length - 1)).toBe(false);
  });
});

describe("the Intraday style's stop and hourly turn", () => {
  it("lifts a long's stop under each completed bottom and never lowers it; a short mirrors it (Polarity)", () => {
    const bars = walk("2026-10-21", RISING);
    let stop = 95;
    for (let j = 0; j < bars.length; j++) {
      const next = intradayTrail(bars.slice(0, j + 1), true, stop, 0.1);
      if (next !== null) {
        expect(next).toBeGreaterThan(stop);
        expect(next).toBeLessThan(bars[j].c);
        stop = next;
      }
    }
    expect(stop).toBeGreaterThan(95);
    const mirrored = bars.map((b) => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));
    let shortStop = 105;
    for (let j = 0; j < mirrored.length; j++) {
      const next = intradayTrail(mirrored.slice(0, j + 1), false, shortStop, 0.1);
      if (next !== null) shortStop = next;
    }
    expect(shortStop).toBeCloseTo(200 - stop, 6);
  });

  it("reads the hourly swing chart's turn against the trade", () => {
    const up = walk("2026-10-21", [[8, 2], [4, -0.5], [8, 2]]);
    expect(hourlyTurnedAgainst(up, true)).toBe(false);
    const turned = [...up, ...walk("2026-10-21", [[6, -4]], up[up.length - 1].c, up.length)];
    expect(hourlyTurnedAgainst(turned, true)).toBe(true);
    expect(hourlyTurnedAgainst(turned, false)).toBe(false);
  });

  it("closes at the session's end only when asked, and reports the trail it walked from the fill", () => {
    const bars = walk("2026-10-21", RISING);
    const input = { side: "long" as const, initialStop: 95, filledAt: bars[0].t, point: 0.1, bars };
    const late = new Date("2026-10-21T19:50:00Z");
    expect(readIntradayExit({ ...input, now: late, closeAtSessionEnd: true }).exit?.reason).toBe("session_close");
    const held = readIntradayExit({ ...input, now: late, closeAtSessionEnd: false });
    expect(held.exit).toBeNull();
    expect(held.stopReason).toBe("intraday_swing");
    expect(held.stop).toBeGreaterThan(95);
    // Bars before the fill never move the stop.
    expect(readIntradayExit({ ...input, filledAt: "2026-10-22T13:30:00Z", now: late, closeAtSessionEnd: false }).stop).toBe(95);
  });
});

describe("the live reading", () => {
  it("is null until there are bars before the fill to fix the intraday point from", () => {
    const bars = walk("2026-10-21", RISING);
    const daily: Bar[] = Array.from({ length: 30 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`, o: 99, h: 101, l: 98, c: 100, v: 1e6 }));
    const now = new Date("2026-10-21T18:00:00Z");
    expect(readIntradayExitFromBars({ side: "long", initialStop: 95, openedAt: bars[2].t }, bars, daily, now)).toBeNull();
    const reading = readIntradayExitFromBars({ side: "long", initialStop: 95, openedAt: bars[16].t }, bars, daily, now);
    expect(reading).not.toBeNull();
    expect(reading!.stop).toBeGreaterThanOrEqual(95);
  });
});

describe("the first change in trend", () => {
  it("is a turn after the fill, not a trend already against the trade when it filled", () => {
    const up = walk("2026-10-21", [[8, 2], [4, -0.5], [8, 2]]);
    const down = walk("2026-10-21", [[6, -4], [6, -2]], up[up.length - 1].c, up.length);
    const bars = [...up, ...down];
    const late = new Date("2026-10-21T19:00:00Z");
    const turnAt = bars.findIndex((_, j) => hourlyTurnedAgainst(bars.slice(0, j + 1), true));
    expect(turnAt).toBeGreaterThan(0);
    expect(turnAt).toBeLessThan(bars.length - 2);
    // A long filled before the turn leaves on it.
    const long = readIntradayExit({ side: "long", initialStop: 50, filledAt: up[10].t, point: 0.1, bars, now: late, closeAtSessionEnd: false });
    expect(long.exit?.reason).toBe("intraday_trend_change");
    // A long filled after the chart had already turned down has seen no change yet.
    const after = readIntradayExit({ side: "long", initialStop: 50, filledAt: bars[turnAt + 1].t, point: 0.1, bars, now: late, closeAtSessionEnd: false });
    expect(after.exit).toBeNull();
  });
});
