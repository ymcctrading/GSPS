import { describe, expect, it } from "vitest";
import { cardChartMarkers, cardPlanRelation, drawPlanLines } from "@/lib/cards/tickerCard";

describe("cardPlanRelation", () => {
  it("is none without a card", () => {
    expect(cardPlanRelation(false, "bearish", "Execute")).toBe("none");
  });
  it("agrees when the daily plan is long or has no side", () => {
    expect(cardPlanRelation(true, "bullish", "Watch")).toBe("agrees");
    expect(cardPlanRelation(true, "none", "Reject")).toBe("agrees");
    expect(cardPlanRelation(true, null, null)).toBe("agrees");
  });
  it("lets the card lead against a sell plan that is not an Execute (AM, 2026-11-12: sell Watch)", () => {
    expect(cardPlanRelation(true, "bearish", "Watch")).toBe("cardLeads");
    expect(cardPlanRelation(true, "bearish", "Reject")).toBe("cardLeads");
    expect(cardPlanRelation(true, "bearish", null)).toBe("cardLeads");
  });
  it("calls both sides armed against a sell Execute", () => {
    expect(cardPlanRelation(true, "bearish", "Execute")).toBe("bothArmed");
  });
});

describe("drawPlanLines", () => {
  it("hides the daily plan's lines only where the card leads", () => {
    expect(drawPlanLines("cardLeads")).toBe(false);
    expect(drawPlanLines("bothArmed")).toBe(true);
    expect(drawPlanLines("agrees")).toBe(true);
    expect(drawPlanLines("none")).toBe(true);
  });
});

describe("cardChartMarkers", () => {
  it("draws the card's own labelled levels, the same the Dashboard lists", () => {
    const m = cardChartMarkers({ entry: 20.05, stop: 18.97, tp1: 20.2, tp2: null, mtp: 23.37 });
    expect(m.map((x) => [x.label, x.price])).toEqual([
      ["Card entry", 20.05],
      ["Card SL", 18.97],
      ["Card TP1", 20.2],
      ["Card MTP", 23.37],
    ]);
    expect(m.every((x) => x.label.startsWith("Card "))).toBe(true);
  });
  it("draws TP2 when the card has one and skips bad prices", () => {
    const m = cardChartMarkers({ entry: 100, stop: Number.NaN, tp1: 101, tp2: 104, mtp: null });
    expect(m.map((x) => x.label)).toEqual(["Card entry", "Card TP1", "Card TP2"]);
  });
  it("draws nothing without a card", () => {
    expect(cardChartMarkers(null)).toEqual([]);
    expect(cardChartMarkers(undefined)).toEqual([]);
  });
});
