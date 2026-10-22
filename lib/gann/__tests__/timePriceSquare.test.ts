import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { angleUnit } from "@/lib/gann/fans";
import { computeTimePriceSquare, SQUARE_TOLERANCE_BARS } from "../timePriceSquare";

function bar(t: string, price: number): Bar {
  return { t, o: price, h: price, l: price, c: price, v: 1000 };
}

/** 25 flat bars with a low pivot at index 5 (price 90) and a high pivot at index 15 (price 130). */
function bars(): Bar[] {
  const closes = [
    100, 98, 96, 94, 92, 90, 92, 94, 96, 98, 100, 110, 120, 125, 128, 130, 128, 126, 124, 122, 120,
    119, 118, 117, 116,
  ];
  return closes.map((c, i) => bar(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, c));
}

describe("computeTimePriceSquare", () => {
  it("returns no readings with fewer than 20 bars", () => {
    expect(computeTimePriceSquare(bars().slice(0, 19), 100)).toEqual([]);
  });

  it("reads both the low-anchored and high-anchored pivot", () => {
    const readings = computeTimePriceSquare(bars(), 116);
    const kinds = readings.map((r) => r.anchorKind).sort();
    expect(kinds).toEqual(["high", "low"]);
  });

  it("squares when the bar count and the price move in points land within tolerance", () => {
    // Low anchor at index 5 (price 90); last bar is index 24, so 19 bars
    // elapsed. A price move of 19 Gann points above 90 squares.
    const unit = angleUnit(bars());
    const readings = computeTimePriceSquare(bars(), 90 + 19 * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.barsSinceAnchor).toBe(19);
    expect(low?.priceMovePoints).toBeCloseTo(19, 5);
    expect(low?.squared).toBe(true);
  });

  it("does not square when the price move sits far outside the bar-count tolerance", () => {
    const unit = angleUnit(bars());
    const readings = computeTimePriceSquare(bars(), 90 + (19 + SQUARE_TOLERANCE_BARS + 5) * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.squared).toBe(false);
  });

  it("tolerates a small mismatch between bars and the price move in points", () => {
    const unit = angleUnit(bars());
    const readings = computeTimePriceSquare(bars(), 90 + (19 + SQUARE_TOLERANCE_BARS) * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.squared).toBe(true);
  });

  // Up from lows, down from highs (Master Course Ch. 18, PDF p.440): the same
  // distance on the far side of the anchor is not the swing it measures.
  it("squares a high only on the way down and a low only on the way up", () => {
    const unit = angleUnit(bars());
    // High anchor at index 15 (price 130), 9 bars elapsed.
    const below = computeTimePriceSquare(bars(), 130 - 9 * unit).find((r) => r.anchorKind === "high");
    const above = computeTimePriceSquare(bars(), 130 + 9 * unit).find((r) => r.anchorKind === "high");
    expect(below?.squared).toBe(true);
    expect(above?.priceMovePoints).toBeCloseTo(9, 5);
    expect(above?.squared).toBe(false);
    // Low anchor at index 5 (price 90), 19 bars elapsed: 19 points under it does not square.
    const under = computeTimePriceSquare(bars(), 90 - 19 * unit).find((r) => r.anchorKind === "low");
    expect(under?.priceMovePoints).toBeCloseTo(19, 5);
    expect(under?.squared).toBe(false);
  });
});
