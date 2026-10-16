import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannPointForBars } from "@/lib/gann/pointScale";
import { PATTERN_ANGLES } from "@/lib/gann/patternAngles";
import { ANGLES, computeFanLines } from "@/lib/gann/fans";
import { computeAngleSlopes, nearestGannAngle } from "@/lib/gann/normalizedSlope";
import { computeTimePriceSquare } from "@/lib/gann/timePriceSquare";
import { computeMidpointFan } from "@/lib/gann/midpointFan";

// Q27 (owner, "default to Gann's method"): the fans, the scored angle slope,
// the square of price and time and the 50% fan read price in Gann points
// (`gannPointForBars`), one point per daily bar, on Gann's full angle set, the
// unit and set the S/R angles (`patternAngles.ts`) already use.

const DAY = 86_400_000;
const daily = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 5) + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
const line = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
const closes = [...line(110, 100, 10), ...line(100, 140, 20), ...line(140, 110, 15)];
const bars = daily(closes);
const point = gannPointForBars(bars);

describe("angles read in price-scaled points", () => {
  it("draws the fan on the full angle set", () => {
    expect(ANGLES).toEqual(PATTERN_ANGLES);
  });

  it("rises the fan's 1x1 one point per bar from the low", () => {
    const fans = computeFanLines(bars, 115);
    const oneByOne = fans.find((f) => f.angle === "1x1 (low)")!;
    const elapsed = bars.length - 1 - oneByOne.anchor.index;
    expect(oneByOne.price).toBeCloseTo(oneByOne.anchor.price + point * elapsed, 9);
  });

  it("measures the realised slope in points per bar", () => {
    const low = computeAngleSlopes(bars, 115).find((r) => r.anchorKind === "low")!;
    expect(low.slope).toBeCloseTo((115 - low.anchorPrice) / (point * low.barsSinceAnchor), 9);
  });

  it("classifies a slope against the full set, 8x1 included", () => {
    expect(nearestGannAngle(7.6)?.label).toBe("8x1");
    expect(nearestGannAngle(0.13)?.label).toBe("1x8");
  });

  it("squares price and time in points", () => {
    const low = computeTimePriceSquare(bars, 115).find((r) => r.anchorKind === "low")!;
    expect(low.priceMovePoints).toBeCloseTo(Math.abs(115 - low.anchorPrice) / point, 9);
  });

  it("runs the 50% fan in points", () => {
    const fan = computeMidpointFan(bars)!;
    const elapsed = bars.length - 1 - fan.originIndex;
    const up = fan.lines.find((l) => l.angle === "1x1" && l.direction === "up")!;
    expect(up.price).toBeCloseTo(fan.midpoint + point * elapsed, 9);
  });
});
