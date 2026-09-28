/**
 * `completedDailySessions` — the scan pipeline reads closed days only
 * (2026-09-26, project-owner direction). See the function's own header.
 */
import { describe, expect, it } from "vitest";
import { completedDailySessions } from "@/lib/data/provider";
import type { Bar } from "@/lib/types";

// Alpaca stamps an equity daily bar at 00:00 ET of its session date.
const eqBar = (etDate: string): Bar => ({ t: `${etDate}T04:00:00Z`, o: 10, h: 11, l: 9, c: 10, v: 1000 });

describe("completedDailySessions — equities", () => {
  const bars = [eqBar("2026-09-23"), eqBar("2026-09-24"), eqBar("2026-09-25")];

  it("drops today's candle while the session is still open", () => {
    // 2026-09-25 is a Friday; 14:00 ET = 18:00Z (EDT).
    const out = completedDailySessions(bars, new Date("2026-09-25T18:00:00Z"), "us_equity");
    expect(out.map((b) => b.t.slice(0, 10))).toEqual(["2026-09-23", "2026-09-24"]);
  });

  it("keeps today's candle once the data reaches the 16:00 ET close", () => {
    const out = completedDailySessions(bars, new Date("2026-09-25T20:05:00Z"), "us_equity");
    expect(out).toHaveLength(3);
  });

  it("drops a pre-market candle for today before the open", () => {
    const out = completedDailySessions(bars, new Date("2026-09-25T12:00:00Z"), "us_equity");
    expect(out).toHaveLength(2);
  });

  it("keeps Friday's candle over the weekend", () => {
    const out = completedDailySessions(bars, new Date("2026-09-27T15:00:00Z"), "us_equity");
    expect(out).toHaveLength(3);
  });

  it("leaves an empty series alone", () => {
    expect(completedDailySessions([], new Date(), "us_equity")).toEqual([]);
  });
});

describe("completedDailySessions — crypto", () => {
  const bars: Bar[] = [
    { t: "2026-09-24T00:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: "2026-09-25T00:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
  ];

  it("drops a UTC-day candle that has not finished its 24 hours", () => {
    expect(completedDailySessions(bars, new Date("2026-09-25T23:59:00Z"), "crypto")).toHaveLength(1);
  });

  it("keeps it once the 24 hours have elapsed", () => {
    expect(completedDailySessions(bars, new Date("2026-09-26T00:00:00Z"), "crypto")).toHaveLength(2);
  });
});
