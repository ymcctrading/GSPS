import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { completedDailyBars, dailyBarDate, INTRADAY_DAILY_BAR_LIMIT, priorDailyClose } from "@/lib/scanner/priorClose";

/**
 * The completed daily sessions before an intraday session, as the live
 * intraday scan and the alert replay both read them. A crypto daily bar is the
 * UTC day (stamped 00:00 UTC, the evening before in New York); an equity's is
 * its New York date.
 */

const bar = (t: string, c: number): Bar => ({ t, o: c, h: c + 1, l: c - 1, c, v: 1000 });

describe("crypto at the day boundary", () => {
  // UTC days Oct 20, 21 and 22. The Oct 22 bar is still forming during New
  // York's Oct 22 session (it ends at 00:00 UTC Oct 23, 8 PM ET Oct 22).
  const daily = [bar("2026-10-20T00:00:00Z", 100), bar("2026-10-21T00:00:00Z", 110), bar("2026-10-22T00:00:00Z", 125)];

  it("reads the UTC day that ended before the New York session, not the one forming", () => {
    expect(priorDailyClose(daily, "2026-10-22", true)).toBe(110);
    expect(completedDailyBars(daily, "2026-10-22", true).map((b) => b.c)).toEqual([100, 110]);
  });

  it("keyed by New York date the forming bar would have passed as prior", () => {
    // The defect this module fixes: 00:00 UTC Oct 22 is Oct 21 in New York.
    expect(dailyBarDate(daily[2], false)).toBe("2026-10-21");
    expect(dailyBarDate(daily[2], true)).toBe("2026-10-22");
  });

  it("a late-evening New York scan still reads the same prior close", () => {
    // 9 PM ET Oct 22 is already Oct 23 UTC, but the New York session is Oct 22.
    expect(priorDailyClose(daily, "2026-10-22", true)).toBe(110);
    expect(priorDailyClose(daily, "2026-10-23", true)).toBe(125);
  });

  it("winter time (EST) keys the same", () => {
    const winter = [bar("2026-12-01T00:00:00Z", 50), bar("2026-12-02T00:00:00Z", 55)];
    expect(priorDailyClose(winter, "2026-12-02", true)).toBe(50);
  });
});

describe("equities", () => {
  const daily = [bar("2026-10-20T04:00:00Z", 40), bar("2026-10-21T04:00:00Z", 41), bar("2026-10-22T04:00:00Z", 42)];

  it("reads the prior New York session and leaves today's forming bar out", () => {
    expect(priorDailyClose(daily, "2026-10-22", false)).toBe(41);
    expect(completedDailyBars(daily, "2026-10-22", false)).toHaveLength(2);
  });

  it("is unchanged by a 05:00 UTC stamp (EST)", () => {
    const est = [bar("2026-12-01T05:00:00Z", 40), bar("2026-12-02T05:00:00Z", 41)];
    expect(priorDailyClose(est, "2026-12-02", false)).toBe(40);
  });
});

describe("window and edge cases", () => {
  it("starts at the window's first date and keeps at most the live fetch limit", () => {
    const many: Bar[] = [];
    for (let i = 0; i < INTRADAY_DAILY_BAR_LIMIT + 50; i++) {
      many.push(bar(new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(), 10 + i));
    }
    const out = completedDailyBars(many, "2026-12-31", true);
    expect(out).toHaveLength(INTRADAY_DAILY_BAR_LIMIT);
    expect(out[out.length - 1]).toBe(many[many.length - 1]);
    expect(completedDailyBars(many, "2026-12-31", true, "2025-06-01")[0].t.slice(0, 10)).toBe("2025-06-01");
  });

  it("skips unparseable stamps and returns null without history or a positive close", () => {
    expect(priorDailyClose([bar("not a date", 5)], "2026-10-22", false)).toBeNull();
    expect(priorDailyClose([], "2026-10-22", true)).toBeNull();
    expect(priorDailyClose([bar("2026-10-21T04:00:00Z", 0)], "2026-10-22", false)).toBeNull();
  });
});

describe("live and replay read the same function", () => {
  // The two surfaces must not drift again: both call this module, and
  // neither keeps its own date test on daily bars.
  const route = readFileSync("app/api/intraday-scan/route.ts", "utf8");
  const replay = readFileSync("lib/backtest/replayIntradayAlerts.ts", "utf8");

  it("the live route builds its prior close and completed sessions here", () => {
    expect(route).toMatch(/priorDailyClose\(dailyBars, sessionBars\.sessionDate, crypto\)/);
    expect(route).toMatch(/completedDailyBars\(dailyBars, sessionBars\.sessionDate, crypto\)/);
    expect(route).not.toMatch(/function previousClose/);
  });

  it("the replay builds its completed sessions here", () => {
    expect(replay).toMatch(/completedDailyBars\(dailyBars, date, kind === "crypto", dailyFrom\)/);
    expect(replay).not.toMatch(/b\.t\.slice\(0, 10\) < date/);
  });
});
