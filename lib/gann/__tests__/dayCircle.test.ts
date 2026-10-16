import { describe, expect, it } from "vitest";
import { dayDegree, readDayCircle, timeOfDegree } from "../dayCircle";

// Gann's plate clock (source notes A12, B12): 0° at 6:00 AM, 15° an hour,
// 90° noon, 180° 6:00 PM, 270° midnight, 292.5° 1:30 AM, 315° 3:00 AM.

describe("the plate's day clock", () => {
  it("puts the plate's times on their degrees (New York time)", () => {
    expect(dayDegree(new Date("2026-03-21T10:00:00Z"))).toBeCloseTo(0, 6); // 6:00 AM EDT
    expect(dayDegree(new Date("2026-06-21T16:00:00Z"))).toBeCloseTo(90, 6); // noon EDT
    expect(dayDegree(new Date("2026-09-22T22:00:00Z"))).toBeCloseTo(180, 6); // 6:00 PM EDT
    expect(dayDegree(new Date("2026-12-21T05:00:00Z"))).toBeCloseTo(270, 6); // midnight EST
    expect(dayDegree(new Date("2027-01-13T06:30:00Z"))).toBeCloseTo(292.5, 6); // 1:30 AM EST
    expect(dayDegree(new Date("2027-02-04T08:00:00Z"))).toBeCloseTo(315, 6); // 3:00 AM EST
  });

  it("reads 292.5° and 315° as AM, as the plate prints them", () => {
    expect(timeOfDegree(292.5)).toBe("1:30 AM");
    expect(timeOfDegree(315)).toBe("3:00 AM");
    expect(timeOfDegree(90)).toBe("12:00 PM");
    expect(timeOfDegree(150)).toBe("4:00 PM");
  });

  it("finds the major degree inside a 15-minute bar", () => {
    expect(readDayCircle(new Date("2026-06-22T14:00:00Z"), 15).majorDegree).toBe(60); // 10:00 AM bar
    expect(readDayCircle(new Date("2026-06-22T14:15:00Z"), 15).majorDegree).toBeNull(); // 10:15
    expect(readDayCircle(new Date("2026-06-22T15:45:00Z"), 15).majorDegree).toBeNull(); // 11:45, ends at noon
    expect(readDayCircle(new Date("2026-06-22T16:00:00Z"), 15).majorDegree).toBe(90); // noon bar
  });

  it("reads price on the degree of its time angle", () => {
    // 150 points at 4:00 PM (150°), one point to a degree.
    expect(readDayCircle(new Date("2026-06-22T20:00:00Z"), 0, 150, 1).priceOnTimeAngle).toBe(true);
    expect(readDayCircle(new Date("2026-06-22T20:00:00Z"), 0, 170, 1).priceOnTimeAngle).toBe(false);
  });
});
