import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { patternAngleLevels, patternAngleLines, PATTERN_ANGLES, readPatternAngles } from "../patternAngles";

const DAY = 86_400_000;
const START = Date.parse("2026-01-02T00:00:00Z");

function bars(lows: number[], highs: number[]): Bar[] {
  return lows.map((l, i) => ({
    t: new Date(START + i * DAY).toISOString(),
    o: (l + highs[i]) / 2,
    h: highs[i],
    l,
    c: (l + highs[i]) / 2,
    v: 1000,
  }));
}

// Up from 10 to a top of 30 at bar 10, then down to 22 at bar 19.
const LOWS = [10, 11, 13, 15, 17, 19, 21, 23, 25, 26, 27, 26, 25, 24, 23, 22, 22, 21, 21, 22];
const HIGHS = LOWS.map((l, i) => (i === 10 ? 30 : l + 2));
const B = bars(LOWS, HIGHS);

describe("the full angle set", () => {
  it("carries the eleven angles from 16x1 to 1x16", () => {
    expect(PATTERN_ANGLES.map((a) => a.label)).toEqual([
      "16x1", "8x1", "4x1", "3x1", "2x1", "1x1", "1x2", "1x3", "1x4", "1x8", "1x16",
    ]);
  });

  it("runs each angle up from the extreme low on the point unit", () => {
    const lines = patternAngleLines(B, 1);
    const up = lines.find((l) => l.from.kind === "bottom" && l.from.index === 0 && l.angle === "1x1" && !l.parallelFrom);
    expect(up?.price).toBe(10 + 19);
    const quarter = lines.find((l) => l.from.index === 0 && l.angle === "1x4" && !l.parallelFrom);
    expect(quarter?.price).toBe(10 + 19 / 4);
  });

  it("runs each angle down from the extreme high and copies it to the preceding low", () => {
    const lines = patternAngleLines(B, 1);
    const down = lines.find((l) => l.from.kind === "top" && l.from.index === 10 && l.angle === "1x4" && !l.parallelFrom);
    expect(down?.price).toBe(30 - 9 / 4);
    const copy = lines.find((l) => l.from.index === 10 && l.angle === "1x4" && l.parallelFrom?.index === 0);
    expect(copy?.price).toBe(10 - 19 / 4);
    expect(copy?.slope).toBe(-1 / 4);
  });

  it("drops lines below zero", () => {
    expect(patternAngleLines(B, 1).every((l) => l.price > 0)).toBe(true);
  });

  it("gives the nearest line above and below price to the S/R list", () => {
    const price = 22;
    const levels = patternAngleLevels(B, price, 1);
    expect(levels).toHaveLength(2);
    const all = patternAngleLines(B, 1).map((l) => l.price);
    const below = Math.max(...all.filter((p) => p <= price));
    const above = Math.min(...all.filter((p) => p > price));
    expect(levels.map((l) => l.price).sort((a, b) => a - b)).toEqual([below, above]);
    expect(levels[0].label).toMatch(/^Angle: /);
  });

  it("reads price on a line within one point", () => {
    const r = readPatternAngles(B, 29, 1);
    expect(r?.on).not.toBeNull();
    expect(readPatternAngles(B, 29, 0)).toBeNull();
  });
});
