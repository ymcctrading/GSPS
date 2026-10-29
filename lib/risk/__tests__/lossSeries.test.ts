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

  it("skips a market holiday, so the pause still covers the next trading day", () => {
    // Wednesday 2026-11-25 completes the series; Thursday is Thanksgiving, so
    // Friday 2026-11-27 is the next trading day and is still paused.
    const wed = "2026-11-25T18:00:00Z";
    const trades = [loss(wed), loss(wed), loss(wed)];
    expect(readLossSeries(trades, new Date("2026-11-27T15:00:00Z")).paused).toBe(true);
    expect(readLossSeries(trades, new Date("2026-11-30T15:00:00Z")).paused).toBe(false);
  });

  it("does not pause on two losses, or when a win breaks the run", () => {
    expect(readLossSeries([loss(third), loss(third)], new Date(third)).paused).toBe(false);
    expect(readLossSeries([loss(third), win(third), loss(third), loss(third)], new Date(third)).consecutiveLosses).toBe(1);
  });

  it("names the losses it counted and the day entries resume", () => {
    // The icharles case of 2026-10-29: AMD Oct 9, IWM and MSFT Oct 28 (ET).
    const trades: ClosedTrade[] = [
      { outcome: "loss", exitTimestamp: "2026-10-28T19:54:04Z", symbol: "MSFT", profitLossDollars: -3.94 },
      { outcome: "loss", exitTimestamp: "2026-10-28T14:54:05Z", symbol: "IWM", profitLossDollars: -2.84 },
      { outcome: "loss", exitTimestamp: "2026-10-09T08:22:43Z", symbol: "AMD", profitLossDollars: -77.16 },
      { outcome: "profit", exitTimestamp: "2026-09-28T17:33:36Z", symbol: "AMD", profitLossDollars: 392.82 },
    ];
    const r = readLossSeries(trades, new Date("2026-10-29T14:30:00Z"));
    expect(r.paused).toBe(true);
    expect(r.resumesOn).toBe("2026-10-30");
    expect(r.losses.map((l) => l.symbol)).toEqual(["MSFT", "IWM", "AMD"]);
    expect(r.note).toContain("MSFT Oct 28, -$3.94; IWM Oct 28, -$2.84; AMD Oct 9, -$77.16");
    expect(r.note).toContain("resume Fri, Oct 30");
    expect(readLossSeries(trades, new Date("2026-10-30T13:00:00Z")).paused).toBe(false);
  });

  it("resumes after a holiday that falls in the pause", () => {
    const wed = "2026-11-25T18:00:00Z";
    const r = readLossSeries([loss(wed), loss(wed), loss(wed)], new Date("2026-11-25T19:00:00Z"));
    expect(r.resumesOn).toBe("2026-11-30");
  });
});
