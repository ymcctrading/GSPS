import { describe, expect, it } from "vitest";
import {
  approachingFigure,
  figuresAround,
  figuresBetween,
  roundNumberEntryBlocked,
  shortOfFigure,
  stopBeyondFigure,
  targetCandidates,
} from "@/lib/gann/evenFigures";

describe("even figures", () => {
  it("scales the grid with price: quarters at $100 and above, halves below", () => {
    expect(figuresAround(148)).toEqual({ above: { price: 150, kind: "popular" }, below: { price: 125, kind: "popular" } });
    expect(figuresAround(196).above).toEqual({ price: 200, kind: "major" });
    expect(figuresAround(43).above).toEqual({ price: 45, kind: "popular" });
    expect(figuresAround(48).above).toEqual({ price: 50, kind: "major" });
    expect(figuresAround(9.8).above?.price).toBe(10);
  });

  it("lists every figure between two prices", () => {
    expect(figuresBetween(90, 130).map((f) => f.price)).toEqual([95, 100, 125]);
  });

  it("notices a round number overhead for a long and underneath for a short", () => {
    expect(approachingFigure(98.5, "bullish")?.figure.price).toBe(100);
    expect(approachingFigure(101, "bearish")?.figure.price).toBe(100);
    expect(approachingFigure(96, "bullish")).toBeNull();
  });

  it("places orders just before the figure", () => {
    expect(shortOfFigure(100, "below")).toBeCloseTo(99.5, 6);
    expect(shortOfFigure(100, "above")).toBeCloseTo(100.5, 6);
    expect(targetCandidates(92, 104, "bullish").map((p) => Math.round(p * 100) / 100)).toEqual([94.53, 99.5]);
  });

  it("moves a stop sitting just on a figure beyond it", () => {
    // Long from 105 with a stop at 100.40: the stop belongs under 100.
    expect(stopBeyondFigure(105, 100.4, "bullish", 8)).toBeCloseTo(99.7, 6);
    // Mirror for a short.
    expect(stopBeyondFigure(95, 99.6, "bearish", 8)).toBeCloseTo(100.3, 6);
    // No figure nearby, or the move would pass the cap: unchanged.
    expect(stopBeyondFigure(105, 97.3, "bullish", 8)).toBe(97.3);
    expect(stopBeyondFigure(101, 100.4, "bullish", 1)).toBe(100.4);
  });

  it("holds an automated entry into a round number unless the plan's breakout is that number", () => {
    expect(roundNumberEntryBlocked({ entry: 99.2, direction: "bullish", crossedLevel: 97 }).blocked).toBe(true);
    expect(roundNumberEntryBlocked({ entry: 99.2, direction: "bullish", crossedLevel: 99.9 }).blocked).toBe(false);
    expect(roundNumberEntryBlocked({ entry: 96, direction: "bullish", crossedLevel: 95 }).blocked).toBe(false);
  });
});
