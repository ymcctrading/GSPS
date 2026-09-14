import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
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

  it("squares when the bar count and the ATR-normalized price move land within tolerance", () => {
    // Low anchor at index 5 (price 90); last bar is index 24, so 19 bars
    // elapsed. A price move of 19 ATR-units above 90 squares.
    const unit = atr(bars(), 14);
    const readings = computeTimePriceSquare(bars(), 90 + 19 * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.barsSinceAnchor).toBe(19);
    expect(low?.priceMoveAtrUnits).toBeCloseTo(19, 5);
    expect(low?.squared).toBe(true);
  });

  it("does not square when the price move sits far outside the bar-count tolerance", () => {
    const unit = atr(bars(), 14);
    const readings = computeTimePriceSquare(bars(), 90 + (19 + SQUARE_TOLERANCE_BARS + 5) * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.squared).toBe(false);
  });

  it("tolerates a small mismatch between bars and the ATR-normalized price move", () => {
    const unit = atr(bars(), 14);
    const readings = computeTimePriceSquare(bars(), 90 + (19 + SQUARE_TOLERANCE_BARS) * unit);
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.squared).toBe(true);
  });
});
