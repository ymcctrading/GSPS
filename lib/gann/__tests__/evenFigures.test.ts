import { pricePoint } from "../pointScale";
import { describe, expect, it } from "vitest";
import {
  approachingFigure,
  figuresAround,
  figuresBetween,
  readFigureCrossing,
  roundNumberEntryBlocked,
  shortOfFigure,
  stopBeyondFigure,
  targetCandidates,
} from "@/lib/gann/evenFigures";
import { threePoints } from "@/lib/gann/pointScale";
import { applyFigureCrossingHold } from "@/lib/scoring/score";

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
    // ¼ to ½ point inside the figure (WSSS Ch.V), taken as ⅜ of a price-scaled point.
    expect(shortOfFigure(100, "below")).toBeCloseTo(100 - 0.375 * pricePoint(100), 6);
    expect(shortOfFigure(100, "above")).toBeCloseTo(100 + 0.375 * pricePoint(100), 6);
    expect(targetCandidates(92, 104, "bullish").map((p) => Math.round(p * 100) / 100)).toEqual([95, 100].map((f) => Math.round(shortOfFigure(f, "below") * 100) / 100));
  });

  it("moves a stop sitting just on a figure beyond it", () => {
    // Long from 105 with a stop at 100.40: the stop belongs under 100, by
    // Gann's 3 points scaled to $100 (about 5).
    expect(stopBeyondFigure(105, 100.4, "bullish", 15)).toBeCloseTo(100 - threePoints(100), 6);
    // Mirror for a short.
    expect(stopBeyondFigure(95, 99.6, "bearish", 15)).toBeCloseTo(100 + threePoints(100), 6);
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

// A-LEVELS-08 (Stock Selector Ch. V; Tunnel PDF 151/166): above 200 expect
// 202-203 and a break back; buy the third time through, for 210 or 225.
describe("the third time through a round number", () => {
  /** Daily closes; each bar spans close ± 0.5. */
  const days = (closes: number[]) =>
    closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
  const approach = Array.from({ length: 20 }, (_, i) => 180 + i);
  const through = [201, 202.5, 196, 190];
  const trigger = { direction: "bullish" as const, level: 198, triggerPrice: 198 + threePoints(198) };

  it("counts the first time through 200 and holds the buy", () => {
    const r = readFigureCrossing(days(approach), trigger)!;
    expect(r.figure).toBe(200);
    expect(r.time).toBe(1);
    const execute = { score: 7, outputState: "Execute" as const, breakdown: [] };
    expect(applyFigureCrossingHold(execute, r).outputState).toBe("Watch");
  });

  it("buys the third time through", () => {
    const r = readFigureCrossing(days([...approach, ...through, ...through, 195, 197]), trigger)!;
    expect(r.time).toBe(3);
    const execute = { score: 7, outputState: "Execute" as const, breakdown: [] };
    expect(applyFigureCrossingHold(execute, r).outputState).toBe("Execute");
  });

  it("reads nothing when the crossing passes no round number", () => {
    expect(readFigureCrossing(days(approach), { direction: "bullish", level: 171, triggerPrice: 171 + threePoints(171) })).toBeNull();
  });

  it("mirrors for a short breaking down through a round number", () => {
    const down = Array.from({ length: 20 }, (_, i) => 220 - i);
    const r = readFigureCrossing(days(down), { direction: "bearish", level: 202, triggerPrice: 202 - threePoints(202) })!;
    expect(r.figure).toBe(200);
    expect(r.time).toBe(1);
  });
});
