import { describe, expect, it } from "vitest";
import { rolling48hLoss, startOfDayLoss, rollingHighWaterDrawdown } from "@/lib/risk/metrics";

const sample = (iso: string, equity: number) => ({ at: new Date(iso), equity });

describe("rolling48hLoss", () => {
  it("computes loss from the equity ~48h before now to the latest sample", () => {
    const samples = [
      sample("2026-08-20T14:00:00Z", 450),
      sample("2026-08-22T14:00:00Z", 427.5), // 5% down over 48h
    ];
    const m = rolling48hLoss(samples, new Date("2026-08-22T14:00:00Z"));
    expect(m.lossPct).toBeCloseTo(5, 6);
  });

  it("reports 0 loss when equity is flat or up", () => {
    const samples = [sample("2026-08-20T14:00:00Z", 450), sample("2026-08-22T14:00:00Z", 460)];
    const m = rolling48hLoss(samples, new Date("2026-08-22T14:00:00Z"));
    expect(m.lossPct).toBe(0);
  });
});

describe("startOfDayLoss", () => {
  it("uses the prior session close as baseline", () => {
    const samples = [
      sample("2026-08-21T20:00:00Z", 450), // prior close
      sample("2026-08-22T15:00:00Z", 445),
    ];
    const m = startOfDayLoss(samples, new Date("2026-08-21T20:00:00Z"), new Date("2026-08-22T15:00:00Z"));
    expect(m.lossPct).toBeCloseTo((5 / 450) * 100, 6);
  });
});

describe("rollingHighWaterDrawdown", () => {
  it("uses the 30-day trailing peak, not all-time", () => {
    const now = new Date("2026-08-28T14:00:00Z");
    const samples = [
      sample("2026-06-01T14:00:00Z", 1000), // outside the 30-day window
      sample("2026-08-10T14:00:00Z", 500), // in-window peak
      sample("2026-08-28T14:00:00Z", 460),
    ];
    const m = rollingHighWaterDrawdown(samples, now);
    expect(m.baselineEquity).toBe(500);
    expect(m.lossPct).toBeCloseTo(8, 6);
  });

  it("returns 0 when no samples fall in the window", () => {
    const m = rollingHighWaterDrawdown([], new Date("2026-08-28T14:00:00Z"));
    expect(m.lossPct).toBe(0);
  });
});
