import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyRegime } from "../regime";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

/** A zigzag uptrend: legs up for 8 bars then a 3-bar pullback, each leg higher than the last. */
function uptrendBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 11;
    const rising = cyclePos < 8;
    const o = price;
    const c = price + (rising ? 0.8 : -0.5);
    // Asymmetric wick padding avoids the exact high/low ties a symmetric
    // +/-0.2 buffer produces at every leg turn (open(i) === close(i-1)),
    // which would otherwise mask real swing points from findPivots.
    const h = rising ? c + 0.5 : o + 0.1;
    const l = rising ? o - 0.1 : c - 0.5;
    bars.push(bar(o, h, l, c, 1000 + (i % 5) * 50));
    price = c;
  }
  return bars;
}

/** A flat, oscillating range between two bounds. */
function rangeBars(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 10;
    const base = 100 + (cyclePos < 5 ? cyclePos : 10 - cyclePos) * 0.4;
    bars.push(bar(base, base + 0.4, base - 0.4, base + (i % 2 === 0 ? 0.1 : -0.1), 900));
  }
  return bars;
}

describe("classifyRegime", () => {
  it("flags event/high-uncertainty regardless of price action when a hard flag is set", () => {
    const read = classifyRegime({ bars: uptrendBars(80), staleData: true });
    expect(read.regime).toBe("event");
    expect(read.direction).toBe("sideways");
  });

  // A-TIME-36 (W022 pp.195-197, 217; owner, Q26): a scheduled report date is
  // a turn date, recorded as context, not a reason to stand aside.
  it("records a scheduled report day as a turn date and keeps reading the trend", () => {
    const plain = classifyRegime({ bars: uptrendBars(120) });
    const read = classifyRegime({ bars: uptrendBars(120), scheduledReportDay: true });
    expect(read.regime).toBe(plain.regime);
    expect(read.direction).toBe(plain.direction);
    expect(read.turnDate).toBe(true);
    expect(read.reasons.some((r) => r.startsWith("Scheduled report date"))).toBe(true);
    expect(plain.turnDate).toBe(false);
  });

  it("reads a clean, sustained uptrend as a bullish trend", () => {
    const read = classifyRegime({ bars: uptrendBars(120) });
    expect(read.regime).toBe("trend");
    expect(read.direction).toBe("bullish");
    expect(read.disqualifiers).toHaveLength(0);
  });

  it("reads insufficient history as event/high-uncertainty rather than guessing", () => {
    const read = classifyRegime({ bars: uptrendBars(10) });
    expect(read.regime).toBe("event");
  });

  it("reads a flat oscillating range as the range regime", () => {
    const read = classifyRegime({ bars: rangeBars(120) });
    expect(read.regime).toBe("range");
    expect(read.direction).toBe("sideways");
  });
});

describe("the report-day turn date on every surface", () => {
  it("is read on the live scan and the signal replay", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/scanTicker.ts", "utf8")).toMatch(/classifyRegime\(\{ bars: daily, scheduledReportDay: isScheduledReportDay\(/);
    expect(readFileSync("lib/backtest/replaySignals.ts", "utf8")).toMatch(/classifyRegime\(\{ bars: window, scheduledReportDay: isScheduledReportDay\(/);
  });

  // A-TIME-36: the rule is about actual report dates. The calendar's dates are
  // generated from a reporting cadence, so they are estimates and never a turn date.
  it("marks every generated report date unconfirmed", async () => {
    const { generateEarningsForMonth } = await import("@/lib/macro/earnings");
    const events = generateEarningsForMonth(new Date("2026-10-01T00:00:00Z"));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.confirmed === false)).toBe(true);
  });

  it("never sets a turn date from a generated report date", async () => {
    const { generateEarningsForMonth, isScheduledReportDay } = await import("@/lib/macro/earnings");
    for (const e of generateEarningsForMonth(new Date("2026-10-01T00:00:00Z"))) {
      const day = new Date(`${e.date}T15:00:00Z`);
      expect(isScheduledReportDay(e.symbol, day), `${e.symbol} ${e.date}`).toBe(false);
      const read = classifyRegime({ bars: uptrendBars(120), scheduledReportDay: isScheduledReportDay(e.symbol, day) });
      expect(read.turnDate).toBe(false);
      expect(read.reasons.some((r) => r.startsWith("Scheduled report date"))).toBe(false);
    }
  });

  it("reads a confirmed report date as a turn date on its own day only", async () => {
    const { generateEarningsForMonth, isScheduledReportDay } = await import("@/lib/macro/earnings");
    const e = generateEarningsForMonth(new Date("2026-10-01T00:00:00Z"))[0];
    const confirmed = [{ ...e, confirmed: true }];
    const day = new Date(`${e.date}T15:00:00Z`);
    expect(isScheduledReportDay(e.symbol, day, confirmed)).toBe(true);
    expect(isScheduledReportDay(e.symbol, day, [{ ...e, confirmed: false }])).toBe(false);
    expect(isScheduledReportDay(e.symbol, new Date(day.getTime() + 86_400_000), confirmed)).toBe(false);
  });
});
