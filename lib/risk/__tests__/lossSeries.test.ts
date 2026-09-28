import { describe, expect, it } from "vitest";
import { readLossSeries, type ClosedTrade } from "@/lib/risk/lossSeries";

const loss = (at: string): ClosedTrade => ({ outcome: "loss", exitTimestamp: at });
const win = (at: string): ClosedTrade => ({ outcome: "profit", exitTimestamp: at });

describe("readLossSeries (series-of-losses pause)", () => {
  // Wed 2026-09-23 18:00 UTC = 14:00 ET
  const third = "2026-09-23T18:00:00Z";

  it("pauses after three losses in a row, for that day and the next trading day", () => {
    const trades = [loss(third), loss("2026-09-23T15:00:00Z"), loss("2026-09-22T15:00:00Z"), win("2026-09-21T15:00:00Z")];
    expect(readLossSeries(trades, new Date("2026-09-23T19:00:00Z")).paused).toBe(true);
    expect(readLossSeries(trades, new Date("2026-09-24T15:00:00Z")).paused).toBe(true);
    const later = readLossSeries(trades, new Date("2026-09-25T15:00:00Z"));
    expect(later.paused).toBe(false);
    expect(later.consecutiveLosses).toBe(3);
  });

  it("counts a weekend as no trading days", () => {
    // Friday loss completes the series; Monday is the next trading day, so still paused.
    const fri = "2026-09-25T18:00:00Z";
    const trades = [loss(fri), loss(fri), loss(fri)];
    expect(readLossSeries(trades, new Date("2026-09-28T15:00:00Z")).paused).toBe(true);
    expect(readLossSeries(trades, new Date("2026-09-29T15:00:00Z")).paused).toBe(false);
  });

  it("does not pause on two losses, or when a win breaks the run", () => {
    expect(readLossSeries([loss(third), loss(third)], new Date(third)).paused).toBe(false);
    expect(readLossSeries([loss(third), win(third), loss(third), loss(third)], new Date(third)).consecutiveLosses).toBe(1);
  });
});
