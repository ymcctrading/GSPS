import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { exchangeHourKey, hourlyBars, hourlyTurnedAgainst, intradayTrail, isRegularSessionBar, isSessionLastBar, readIntradayExit, sessionCloseDue } from "@/lib/gann/intradayExit";
import { readIntradayExitFromBars } from "@/lib/trade/gann-exit-live";
import { walkIntradayExit } from "@/lib/backtest/replayIntraday";
import { isEarlyClose } from "@/lib/market/calendar";

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
    expect(hourlyTurnedAgainst(up, true, false)).toBe(false);
    const turned = [...up, ...walk("2026-10-21", [[6, -4]], up[up.length - 1].c, up.length)];
    expect(hourlyTurnedAgainst(turned, true, false)).toBe(true);
    expect(hourlyTurnedAgainst(turned, false, false)).toBe(false);
  });

  it("closes at the session's end only when asked, and reports the trail it walked from the fill", () => {
    const bars = walk("2026-10-21", RISING);
    const input = { side: "long" as const, initialStop: 95, filledAt: bars[0].t, point: 0.1, bars };
    const late = new Date("2026-10-21T19:50:00Z");
    expect(readIntradayExit({ ...input, now: late, closeAtSessionEnd: true, crypto: false }).exit?.reason).toBe("session_close");
    const held = readIntradayExit({ ...input, now: late, closeAtSessionEnd: false, crypto: false });
    expect(held.exit).toBeNull();
    expect(held.stopReason).toBe("intraday_swing");
    expect(held.stop).toBeGreaterThan(95);
    // Bars before the fill never move the stop.
    expect(readIntradayExit({ ...input, filledAt: "2026-10-22T13:30:00Z", now: late, closeAtSessionEnd: false, crypto: false }).stop).toBe(95);
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
    const turnAt = bars.findIndex((_, j) => hourlyTurnedAgainst(bars.slice(0, j + 1), true, false));
    expect(turnAt).toBeGreaterThan(0);
    expect(turnAt).toBeLessThan(bars.length - 2);
    // A long filled before the turn leaves on it.
    const long = readIntradayExit({ side: "long", initialStop: 50, filledAt: up[10].t, point: 0.1, bars, now: late, closeAtSessionEnd: false, crypto: false });
    expect(long.exit?.reason).toBe("intraday_trend_change");
    // A long filled after the chart had already turned down has seen no change yet.
    const after = readIntradayExit({ side: "long", initialStop: 50, filledAt: bars[turnAt + 1].t, point: 0.1, bars, now: late, closeAtSessionEnd: false, crypto: false });
    expect(after.exit).toBeNull();
  });
});

describe("early closes", () => {
  it("knows NYSE's 1:00 PM closes, and that a Friday holiday is not one", () => {
    expect(isEarlyClose("2026-11-27")).toBe(true); // day after Thanksgiving
    expect(isEarlyClose("2026-12-24")).toBe(true); // Thursday
    expect(isEarlyClose("2025-07-03")).toBe(true); // Thursday
    expect(isEarlyClose("2026-07-03")).toBe(false); // the observed Independence Day
    expect(isEarlyClose("2026-11-26")).toBe(false);
    expect(isEarlyClose("2026-10-21")).toBe(false);
  });
  it("closes an intraday trade from 12:45 PM on an early close", () => {
    const filled = new Date("2026-11-27T15:00:00Z"); // 10:00 New York (EST)
    expect(sessionCloseDue(new Date("2026-11-27T17:30:00Z"), filled)).toBe(false); // 12:30 PM
    expect(sessionCloseDue(new Date("2026-11-27T17:50:00Z"), filled)).toBe(true); // 12:50 PM
    const bars: Bar[] = ["15:00", "17:30", "17:45"].map((hm) => ({ t: `2026-11-27T${hm}:00Z`, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    expect(isSessionLastBar(bars, 1)).toBe(false);
    expect(isSessionLastBar(bars, 2)).toBe(true); // 12:45 PM bar
  });
});

describe("exchange hours", () => {
  const daily: Bar[] = Array.from({ length: 30 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`, o: 99, h: 101, l: 98, c: 100, v: 1e6 }));
  it("never lets a pre- or post-market print move a US equity's stop, and leaves crypto's bars alone", () => {
    const regular = walk("2026-10-21", RISING);
    // From 16:00 New York: a post-market run of the same rising swings.
    const post = walk("2026-10-21", [[4, 3], [4, -2], [5, 3]], regular[regular.length - 1].c, 26);
    const now = new Date("2026-10-22T02:00:00Z");
    const input = { side: "long" as const, initialStop: 95, openedAt: regular[16].t };
    const plain = readIntradayExitFromBars(input, regular, daily, now)!;
    const withPost = readIntradayExitFromBars(input, [...regular, ...post], daily, now)!;
    expect(withPost.stop).toBe(plain.stop);
    // Read as crypto, the same prints are the market and do move it.
    expect(readIntradayExitFromBars({ ...input, crypto: true }, [...regular, ...post], daily, now)!.stop).toBeGreaterThan(plain.stop);
  });
});

describe("live and replay walk the same exits", () => {
  it("leave on the same first change in trend, and neither leaves a long filled after the turn", () => {
    const up = walk("2026-10-21", [[8, 2], [4, -0.5], [8, 2]]);
    const down = walk("2026-10-21", [[6, -4], [6, -2]], up[up.length - 1].c, up.length);
    const bars = [...up, ...down];
    const late = new Date("2026-10-21T23:00:00Z");
    const turnAt = bars.findIndex((_, j) => hourlyTurnedAgainst(bars.slice(0, j + 1), true, false));
    // No trail (point 0), so the turn alone decides: the stop's own hit is the
    // exit manager's price check live, and the replay's bar check.
    for (const from of [10, turnAt + 1]) {
      const replay = walkIntradayExit({ bars, from, maxBarsHeld: 500, long: true, entry: bars[from].o, stop: 50, point: 0, firstTarget: null, crypto: false });
      const live = readIntradayExit({ side: "long", initialStop: 50, filledAt: bars[from].t, point: 0, bars, now: late, closeAtSessionEnd: false, crypto: false });
      expect(replay.reason === "intraday_trend_change").toBe(live.exit?.reason === "intraday_trend_change");
      expect(live.exit?.reason === "intraday_trend_change").toBe(from === 10);
    }
  });
});

describe("the hourly chart on exchange hours (Master Course PDF 378)", () => {
  const bar = (t: string): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });
  it("counts a US equity's hours from the 9:30 open, in New York time across the clock change", () => {
    // October (EDT): 13:30 and 14:15 UTC are 9:30 and 10:15, the first hour; 14:30 is 10:30, the second.
    expect(exchangeHourKey(bar("2026-10-21T13:30:00Z"), false)).toBe(exchangeHourKey(bar("2026-10-21T14:15:00Z"), false));
    expect(exchangeHourKey(bar("2026-10-21T14:30:00Z"), false)).not.toBe(exchangeHourKey(bar("2026-10-21T14:15:00Z"), false));
    // November (EST): the open is 14:30 UTC, and 15:15 is still its first hour.
    expect(exchangeHourKey(bar("2026-11-23T14:30:00Z"), false)).toBe(exchangeHourKey(bar("2026-11-23T15:15:00Z"), false));
    expect(exchangeHourKey(bar("2026-11-23T14:30:00Z"), false)).toBe(exchangeHourKey(bar("2026-10-21T13:30:00Z"), false).replace("2026-10-21", "2026-11-23"));
    // The session's last half hour, 15:30-16:00, is its own hour.
    expect(exchangeHourKey(bar("2026-10-21T19:30:00Z"), false)).toBe(exchangeHourKey(bar("2026-10-21T19:45:00Z"), false));
    expect(exchangeHourKey(bar("2026-10-21T19:30:00Z"), false)).not.toBe(exchangeHourKey(bar("2026-10-21T19:15:00Z"), false));
  });
  it("ends an early close's session on its 12:30 half hour, and the alerts' hourly chart drops the prints after it", () => {
    expect(exchangeHourKey(bar("2026-11-27T17:30:00Z"), false)).toBe(exchangeHourKey(bar("2026-11-27T17:45:00Z"), false));
    expect(exchangeHourKey(bar("2026-11-27T17:30:00Z"), false)).not.toBe(exchangeHourKey(bar("2026-11-27T17:15:00Z"), false));
    expect(isRegularSessionBar(bar("2026-11-27T17:45:00Z"))).toBe(true); // 12:45 PM
    expect(isRegularSessionBar(bar("2026-11-27T18:00:00Z"))).toBe(false); // 1:00 PM, after the close
  });
  it("keeps crypto on the clock's hours", () => {
    expect(exchangeHourKey(bar("2026-10-21T13:30:00Z"), true)).toBe(exchangeHourKey(bar("2026-10-21T13:45:00Z"), true));
    expect(exchangeHourKey(bar("2026-10-21T13:45:00Z"), true)).not.toBe(exchangeHourKey(bar("2026-10-21T14:15:00Z"), true));
  });
  it("rolls a regular session's 26 fifteen-minute bars into 6 hours and the last half hour", () => {
    const session = walk("2026-10-21", [[26, 1]]);
    const hours = hourlyBars(session, false);
    expect(hours).toHaveLength(7);
    expect(hours[0].t).toBe("2026-10-21T13:30:00Z");
    expect(hours[0].c).toBe(session[3].c);
    expect(hours[0].h).toBe(Math.max(...session.slice(0, 4).map((b) => b.h)));
    // On the clock's hours the first hour would be 9:30-9:59 alone, half an hour.
    expect(hourlyBars(session, true)[0].c).toBe(session[1].c);
  });
});
