import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  APPROACH_LEAD_DEFAULT_MINUTES,
  SCAN_CADENCE_MINUTES,
  approachDue,
  approachLeadMinutes,
  readEntryApproach,
} from "@/lib/scanner/entryApproach";

const T0 = Date.parse("2026-10-28T14:00:00Z");
const bar = (i: number, c: number, span = 0.05): Bar => ({ t: new Date(T0 + i * 5 * 60_000).toISOString(), o: c, h: c + span, l: c - span, c, v: 1000 });

/** Up to a top of 110 at bar 5, then down 0.5 a bar to 107.5 at bar 10. */
function reaction(): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i <= 5; i++) bars.push(bar(i, 105 + i));
  for (let i = 6; i <= 10; i++) bars.push(bar(i, 110 - (i - 5) * 0.5));
  return bars;
}
const now = new Date(T0 + 10 * 5 * 60_000);

describe("readEntryApproach", () => {
  it("reads the pace from the reaction's top as price per bar and the time left to the entry", () => {
    const r = readEntryApproach({ bars: reaction(), intervalMinutes: 5, direction: "up", entry: 105, unit: 0.25, pivotIndex: -1, dataAgeSeconds: 0, now })!;
    expect(r.extreme).toBeCloseTo(110.05, 10);
    expect(r.barsSince).toBe(5);
    expect(r.ratePerBar).toBeCloseTo((110.05 - 107.5) / 5, 10);
    expect(r.distance).toBeCloseTo(2.5, 10);
    // 2.5 / 0.51 a bar = 4.9 bars of 5 minutes.
    expect(r.etaMinutes).toBeCloseTo((2.5 / 0.51) * 5, 6);
    expect(r.unitsPerBar).toBeCloseTo(0.51 / 0.25, 6);
    expect(Date.parse(r.expectedAt) - now.getTime()).toBeCloseTo(r.etaMinutes * 60_000, -1);
  });

  it("takes the feed's lateness off the time left, never below zero", () => {
    const late = readEntryApproach({ bars: reaction(), intervalMinutes: 5, direction: "up", entry: 105, unit: 0, pivotIndex: -1, dataAgeSeconds: 15 * 60, now })!;
    expect(late.etaMinutes).toBeCloseTo((2.5 / 0.51) * 5 - 15, 6);
    expect(late.unitsPerBar).toBeNull();
    const veryLate = readEntryApproach({ bars: reaction(), intervalMinutes: 5, direction: "up", entry: 105, unit: 0, pivotIndex: -1, dataAgeSeconds: 3600, now })!;
    expect(veryLate.etaMinutes).toBe(0);
  });

  it("reads nothing when price is still making the top, or is at or past the entry", () => {
    const rising = reaction().slice(0, 6);
    expect(readEntryApproach({ bars: rising, intervalMinutes: 5, direction: "up", entry: 105, unit: 0, pivotIndex: -1, dataAgeSeconds: 0, now })).toBeNull();
    expect(readEntryApproach({ bars: reaction(), intervalMinutes: 5, direction: "up", entry: 108, unit: 0, pivotIndex: -1, dataAgeSeconds: 0, now })).toBeNull();
  });

  it("measures from the latest swing top, so an earlier, higher top does not set the pace", () => {
    // A high of 120 early, then a low, then the reaction above.
    const bars = [bar(-3, 120), bar(-2, 104), bar(-1, 104.5), ...reaction()];
    const r = readEntryApproach({ bars, intervalMinutes: 5, direction: "up", entry: 105, unit: 0, pivotIndex: 2, dataAgeSeconds: 0, now })!;
    expect(r.extreme).toBeCloseTo(110.05, 10);
  });

  it("mirrors for a short: a rally toward an entry above price", () => {
    const mirror = (b: Bar): Bar => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c });
    const r = readEntryApproach({ bars: reaction().map(mirror), intervalMinutes: 5, direction: "down", entry: 95, unit: 0, pivotIndex: -1, dataAgeSeconds: 0, now })!;
    expect(r.extreme).toBeCloseTo(89.95, 10);
    expect(r.distance).toBeCloseTo(2.5, 10);
    expect(r.etaMinutes).toBeCloseTo((2.5 / 0.51) * 5, 6);
  });
});

describe("the member's lead", () => {
  it("defaults to 15 minutes and accepts only the listed choices", () => {
    expect(approachLeadMinutes(undefined)).toBe(APPROACH_LEAD_DEFAULT_MINUTES);
    expect(approachLeadMinutes(30)).toBe(30);
    expect(approachLeadMinutes(7)).toBe(15);
    expect(approachLeadMinutes("60")).toBe(60);
  });

  it("is due on the last scan before the lead: within the lead plus one scan", () => {
    expect(approachDue(15 + SCAN_CADENCE_MINUTES, 15)).toBe(true);
    expect(approachDue(15 + SCAN_CADENCE_MINUTES + 1, 15)).toBe(false);
    expect(approachDue(0, 5)).toBe(true);
    expect(approachDue(Number.NaN, 60)).toBe(false);
  });
});
