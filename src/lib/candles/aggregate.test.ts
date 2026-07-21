import { describe, it, expect } from "vitest";
import { aggregateDaily } from "./aggregate";
import type { Tick } from "@/lib/marketData/types";

/** Helper: build a tick at a given UTC ISO string. */
function tick(iso: string, price: number, size = 100): Tick {
  return {
    symbol: "NOK",
    assetClass: "STOCK",
    timestamp: new Date(iso).getTime(),
    price,
    size,
  };
}

describe("aggregateDaily — the 8-vs-9 candle fix", () => {
  it("produces exactly one candle per ET trading day regardless of DST", () => {
    // Two consecutive trading days, each with RTH ticks. During EST (Jan) and
    // EDT (Jul) the UTC offset differs; both must yield one candle per day.
    const ticks: Tick[] = [
      // 2026-01-05 (EST, UTC-5): 09:30 and 15:59 ET = 14:30Z / 20:59Z
      tick("2026-01-05T14:30:00Z", 4.0),
      tick("2026-01-05T20:59:00Z", 4.2),
      // 2026-01-06 EST
      tick("2026-01-06T14:30:00Z", 4.2),
      tick("2026-01-06T20:59:00Z", 4.5),
    ];
    const bars = aggregateDaily(ticks);
    expect(bars).toHaveLength(2);
    expect(bars[0].open).toBe(4.0);
    expect(bars[0].close).toBe(4.2);
    expect(bars[0].high).toBe(4.2);
    expect(bars[0].low).toBe(4.0);
  });

  it("does NOT create an extra candle from pre/post-market ticks by default", () => {
    const ticks: Tick[] = [
      // Pre-market 08:00 ET (13:00Z EST) — must be excluded from the daily candle
      tick("2026-01-05T13:00:00Z", 3.9),
      // RTH
      tick("2026-01-05T14:30:00Z", 4.0),
      tick("2026-01-05T20:59:00Z", 4.2),
      // Post-market 17:00 ET (22:00Z EST) — excluded
      tick("2026-01-05T22:00:00Z", 4.3),
    ];
    const bars = aggregateDaily(ticks);
    // Exactly one candle, and it ignores the ETH ticks (low stays 4.0, high 4.2).
    expect(bars).toHaveLength(1);
    expect(bars[0].low).toBe(4.0);
    expect(bars[0].high).toBe(4.2);
  });

  it("includes ETH ticks only when explicitly requested", () => {
    const ticks: Tick[] = [
      tick("2026-01-05T13:00:00Z", 3.9), // pre-market low
      tick("2026-01-05T14:30:00Z", 4.0),
      tick("2026-01-05T22:00:00Z", 4.3), // post-market high
    ];
    const bars = aggregateDaily(ticks, { includeExtendedHours: true });
    expect(bars).toHaveLength(1);
    expect(bars[0].low).toBe(3.9);
    expect(bars[0].high).toBe(4.3);
  });

  it("excludes weekend ticks", () => {
    const ticks: Tick[] = [
      // 2026-01-10 is a Saturday
      tick("2026-01-10T15:00:00Z", 5.0),
      tick("2026-01-05T14:30:00Z", 4.0),
    ];
    const bars = aggregateDaily(ticks);
    expect(bars).toHaveLength(1);
  });
});
