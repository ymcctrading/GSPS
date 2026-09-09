import { describe, expect, it } from "vitest";
import {
  buildCoordinateLedger,
  nearestLedgerLevel,
  priorPeriodRange,
  rangeFractionLevels,
} from "../coordinateLedger";
import type { Bar } from "@/lib/types";

function bar(t: string, h: number, l: number): Bar {
  return { t, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1000 };
}

describe("priorPeriodRange", () => {
  it("reads the immediately preceding day as the prior-day range", () => {
    const bars = [bar("2026-09-07T00:00:00Z", 105, 95), bar("2026-09-08T00:00:00Z", 110, 100)];
    expect(priorPeriodRange(bars, "day")).toEqual({
      period: "day",
      high: 105,
      low: 95,
      startTimestamp: "2026-09-07T00:00:00Z",
      endTimestamp: "2026-09-07T00:00:00Z",
    });
  });

  it("groups bars into the prior calendar week, excluding the in-progress week", () => {
    // 2026-08-31 (Mon) - 2026-09-04 (Fri): one ISO week. 2026-09-07 (Mon): the next week, still in progress.
    const bars = [
      bar("2026-08-31T00:00:00Z", 100, 90),
      bar("2026-09-01T00:00:00Z", 120, 95),
      bar("2026-09-02T00:00:00Z", 110, 85),
      bar("2026-09-07T00:00:00Z", 200, 190),
    ];
    const range = priorPeriodRange(bars, "week");
    expect(range?.high).toBe(120);
    expect(range?.low).toBe(85);
  });

  it("groups bars into the prior calendar month, excluding the in-progress month", () => {
    const bars = [
      bar("2026-07-15T00:00:00Z", 50, 40),
      bar("2026-08-01T00:00:00Z", 100, 60),
      bar("2026-08-20T00:00:00Z", 130, 90),
      bar("2026-09-01T00:00:00Z", 500, 490),
    ];
    const range = priorPeriodRange(bars, "month");
    expect(range?.high).toBe(130);
    expect(range?.low).toBe(60);
  });

  it("returns null when fewer than two distinct periods exist", () => {
    expect(priorPeriodRange([bar("2026-09-08T00:00:00Z", 105, 95)], "day")).toBeNull();
    expect(priorPeriodRange([], "week")).toBeNull();
  });
});

describe("rangeFractionLevels", () => {
  it("divides the range into eighths and reads role/distance off current price", () => {
    const range = { period: "day" as const, high: 110, low: 100, startTimestamp: "t0", endTimestamp: "t0" };
    const levels = rangeFractionLevels(range, 105);
    expect(levels.map((l) => l.fraction)).toEqual([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
    const half = levels.find((l) => l.fraction === 0.5)!;
    expect(half.price).toBe(105);
    expect(half.role).toBe("support");
    expect(half.distancePct).toBe(0);
  });

  it("returns no levels for a zero-width or invalid range", () => {
    expect(rangeFractionLevels({ period: "day", high: 100, low: 100, startTimestamp: "t", endTimestamp: "t" }, 100)).toEqual([]);
    expect(rangeFractionLevels({ period: "day", high: 110, low: 100, startTimestamp: "t", endTimestamp: "t" }, 0)).toEqual([]);
  });
});

describe("buildCoordinateLedger", () => {
  it("builds day/week/month entries together, null-ing out periods without a completed prior bucket", () => {
    const bars = [bar("2026-09-07T00:00:00Z", 105, 95), bar("2026-09-08T00:00:00Z", 110, 100)];
    const ledger = buildCoordinateLedger(bars, 102);
    expect(ledger.day?.range.high).toBe(105);
    expect(ledger.day?.fractions).toHaveLength(7);
    expect(ledger.week).toBeNull();
    expect(ledger.month).toBeNull();
  });
});

describe("nearestLedgerLevel", () => {
  it("finds the closest coordinate across all periods within proximityPct", () => {
    const bars = [bar("2026-09-07T00:00:00Z", 105, 95), bar("2026-09-08T00:00:00Z", 110, 100)];
    const ledger = buildCoordinateLedger(bars, 105);
    // 105 is exactly the prior day's high.
    const nearest = nearestLedgerLevel(ledger, 105, 0.5);
    expect(nearest).toEqual({ period: "day", fraction: null, price: 105, distancePct: 0, role: "support" });
  });

  it("returns null when nothing is within proximityPct", () => {
    const bars = [bar("2026-09-07T00:00:00Z", 105, 95), bar("2026-09-08T00:00:00Z", 110, 100)];
    const ledger = buildCoordinateLedger(bars, 1000);
    expect(nearestLedgerLevel(ledger, 1000, 0.5)).toBeNull();
  });
});
