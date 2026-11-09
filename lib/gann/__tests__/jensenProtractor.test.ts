/**
 * C-LEVELS-22 (class C, Jensen 1978, Plate 1, printed p. 110, PDF 61L): each
 * scale point is 90 x up/over, and its angle is exactly atan(points / 90),
 * not the printed quarter-degree rounding. The X–G misprint is flagged, not
 * corrected.
 */
import { describe, expect, it } from "vitest";
import { jensenPointAngle, PLATE_1 } from "@/lib/gann/jensen";

const deg = (r: number) => (r * 180) / Math.PI;

describe("Plate 1's protractor table (C-LEVELS-22)", () => {
  it("gives every scale point as 90 x up / over", () => {
    for (const row of PLATE_1) expect(row.points).toBeCloseTo((90 * row.up) / row.over, 10);
  });

  it("gives the exact angle, not the printed rounding: 4 up / 8 over is 45 points at 26.57 degrees", () => {
    expect(jensenPointAngle(45)).toBeCloseTo(deg(Math.atan(4 / 8)), 10);
    expect(jensenPointAngle(45)).toBeCloseTo(26.565, 3);
    expect(PLATE_1.find((r) => r.points === 45)?.printedRight).toBe(26.25);
    expect(jensenPointAngle(90)).toBeCloseTo(45, 10);
    for (const row of PLATE_1) {
      expect(row.rightAngle).toBeCloseTo(deg(Math.atan(row.points / 90)), 10);
      expect(row.topAngle).toBeCloseTo(90 - row.rightAngle, 10);
    }
  });

  it("flags the X–G top angle as a misprint and keeps it as printed", () => {
    const g = PLATE_1.find((r) => r.ray === "G")!;
    expect(g.printedTop).toBe(54.5);
    expect(g.misprint).toBe(true);
    for (const row of PLATE_1.filter((r) => r.ray !== "G" && r.printedTop !== null)) {
      expect(row.misprint).toBe(false);
      expect(row.printedTop).toBe(90 - row.printedRight!);
    }
  });
});
