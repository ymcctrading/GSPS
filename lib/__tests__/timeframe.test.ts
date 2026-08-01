import { describe, expect, it } from "vitest";
import {
  TF_INTERVAL_MS,
  TF_LOOKBACK_DAYS,
  TF_MAX_BARS,
  TIMEFRAMES,
  candleOpens,
  isTimeframe,
  parseTimeframe,
  shiftCandles,
  startOfCandle,
} from "@/lib/timeframe";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("startOfCandle", () => {
  it("floors fixed-length timeframes onto the interval grid", () => {
    // 2026-07-24T13:37:42.500Z — deliberately off every boundary.
    const t = Date.parse("2026-07-24T13:37:42.500Z");
    expect(new Date(startOfCandle(t, "1Min")).toISOString()).toBe("2026-07-24T13:37:00.000Z");
    expect(new Date(startOfCandle(t, "5Min")).toISOString()).toBe("2026-07-24T13:35:00.000Z");
    expect(new Date(startOfCandle(t, "15Min")).toISOString()).toBe("2026-07-24T13:30:00.000Z");
    expect(new Date(startOfCandle(t, "1Hour")).toISOString()).toBe("2026-07-24T13:00:00.000Z");
    expect(new Date(startOfCandle(t, "2Hour")).toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(new Date(startOfCandle(t, "4Hour")).toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(new Date(startOfCandle(t, "1Day")).toISOString()).toBe("2026-07-24T00:00:00.000Z");
  });

  it("floors calendar timeframes to Monday / the 1st / Jan 1", () => {
    const friday = Date.parse("2026-07-24T13:37:42.500Z"); // a Friday
    expect(new Date(startOfCandle(friday, "1Week")).toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(new Date(startOfCandle(friday, "1Month")).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(new Date(startOfCandle(friday, "1Year")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    // Sunday belongs to the week that started the previous Monday.
    const sunday = Date.parse("2026-07-26T23:59:00.000Z");
    expect(new Date(startOfCandle(sunday, "1Week")).toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("is idempotent — an aligned timestamp is its own candle start", () => {
    const now = Date.now();
    for (const tf of TIMEFRAMES) {
      const open = startOfCandle(now, tf);
      expect(startOfCandle(open, tf)).toBe(open);
    }
  });
});

describe("shiftCandles", () => {
  it("steps months and years on the calendar, not by a fixed span", () => {
    const jan31 = Date.parse("2026-01-01T00:00:00.000Z");
    expect(new Date(shiftCandles(jan31, "1Month", 1)).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(new Date(shiftCandles(jan31, "1Month", -1)).toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(new Date(shiftCandles(jan31, "1Year", -3)).toISOString()).toBe("2023-01-01T00:00:00.000Z");
    // Crossing a leap year stays on Jan 1.
    expect(new Date(shiftCandles(jan31, "1Year", 2)).toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });
});

describe("candleOpens", () => {
  it("returns ascending opens exactly one candle apart", () => {
    const end = Date.parse("2026-07-24T13:37:42.500Z");
    const spacing: Partial<Record<(typeof TIMEFRAMES)[number], number>> = {
      "1Min": MIN,
      "5Min": 5 * MIN,
      "15Min": 15 * MIN,
      "1Hour": HOUR,
      "2Hour": 2 * HOUR,
      "4Hour": 4 * HOUR,
      "1Day": DAY,
      "1Week": 7 * DAY,
    };
    for (const [tf, step] of Object.entries(spacing)) {
      const opens = candleOpens(end, tf as (typeof TIMEFRAMES)[number], 50);
      expect(opens).toHaveLength(50);
      for (let i = 1; i < opens.length; i++) {
        expect(opens[i] - opens[i - 1]).toBe(step);
      }
    }
  });

  it("keeps month and year steps on consecutive calendar periods", () => {
    const end = Date.parse("2026-07-24T13:37:42.500Z");
    const months = candleOpens(end, "1Month", 14).map((ms) => new Date(ms).toISOString().slice(0, 7));
    expect(months[months.length - 1]).toBe("2026-07");
    expect(months[0]).toBe("2025-06");

    const years = candleOpens(end, "1Year", 5).map((ms) => new Date(ms).getUTCFullYear());
    expect(years).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it("ends on the candle containing `end`, so the newest bar is the current one", () => {
    const now = Date.now();
    for (const tf of TIMEFRAMES) {
      const opens = candleOpens(now, tf, 10);
      expect(opens[opens.length - 1]).toBe(startOfCandle(now, tf));
      expect(opens[opens.length - 1]).toBeLessThanOrEqual(now);
    }
  });
});

describe("registry completeness", () => {
  it("covers every timeframe in each lookup", () => {
    for (const tf of TIMEFRAMES) {
      expect(TF_INTERVAL_MS[tf]).toBeGreaterThan(0);
      expect(TF_LOOKBACK_DAYS[tf]).toBeGreaterThan(0);
      expect(TF_MAX_BARS[tf]).toBeGreaterThan(0);
    }
  });

  it("orders timeframes from longest candle to shortest", () => {
    for (let i = 1; i < TIMEFRAMES.length; i++) {
      expect(TF_INTERVAL_MS[TIMEFRAMES[i]]).toBeLessThan(TF_INTERVAL_MS[TIMEFRAMES[i - 1]]);
    }
  });

  it("gives short timeframes a recent window and long ones deep history", () => {
    // Per the charting brief: 1m/5m are real-time reads, hourly/daily carry
    // years of levels, weekly/monthly take everything available.
    expect(TF_LOOKBACK_DAYS["1Min"]).toBeLessThanOrEqual(15);
    expect(TF_LOOKBACK_DAYS["5Min"]).toBeLessThanOrEqual(15);
    expect(TF_LOOKBACK_DAYS["1Hour"]).toBeGreaterThanOrEqual(365);
    expect(TF_LOOKBACK_DAYS["1Day"]).toBeGreaterThanOrEqual(365);
    expect(TF_LOOKBACK_DAYS["1Week"]).toBeGreaterThanOrEqual(6 * 365);
    expect(TF_LOOKBACK_DAYS["1Month"]).toBeGreaterThanOrEqual(6 * 365);
  });
});

describe("parseTimeframe", () => {
  it("passes canonical names through untouched", () => {
    for (const tf of TIMEFRAMES) expect(parseTimeframe(tf, "1Day")).toBe(tf);
  });

  it("resolves shorthand without confusing minutes and months", () => {
    expect(parseTimeframe("5m", "1Day")).toBe("5Min");
    expect(parseTimeframe("1m", "1Day")).toBe("1Min");
    expect(parseTimeframe("1Month", "1Day")).toBe("1Month"); // exact match wins
    expect(parseTimeframe("1mo", "1Day")).toBe("1Month");
    expect(parseTimeframe("4h", "1Day")).toBe("4Hour");
    expect(parseTimeframe("1Y", "1Day")).toBe("1Year");
  });

  it("falls back on junk and missing values", () => {
    expect(parseTimeframe(null, "1Day")).toBe("1Day");
    expect(parseTimeframe("", "1Day")).toBe("1Day");
    expect(parseTimeframe("3Fortnight", "1Day")).toBe("1Day");
  });

  it("agrees with isTimeframe", () => {
    expect(isTimeframe("5Min")).toBe(true);
    expect(isTimeframe("5m")).toBe(false);
  });
});
