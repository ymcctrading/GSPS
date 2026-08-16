import { describe, expect, it } from "vitest";
import { applyFill } from "@/lib/brokers/simulator";

describe("applyFill", () => {
  it("opens a fresh long position from a buy with no existing position", () => {
    const out = applyFill(null, "buy", 10, 100);
    expect(out.position).toEqual({ side: "long", qty: 10, avgEntryPrice: 100 });
    expect(out.closed).toBeNull();
  });

  it("opens a fresh short position from a sell with no existing position", () => {
    const out = applyFill(null, "sell", 5, 50);
    expect(out.position).toEqual({ side: "short", qty: 5, avgEntryPrice: 50 });
    expect(out.closed).toBeNull();
  });

  it("blends the average entry when adding to a long in the same direction", () => {
    const out = applyFill({ side: "long", qty: 10, avgEntryPrice: 100 }, "buy", 10, 120);
    expect(out.position).toEqual({ side: "long", qty: 20, avgEntryPrice: 110 });
    expect(out.closed).toBeNull();
  });

  it("blends the average entry when adding to a short in the same direction", () => {
    const out = applyFill({ side: "short", qty: 10, avgEntryPrice: 100 }, "sell", 10, 80);
    expect(out.position).toEqual({ side: "short", qty: 20, avgEntryPrice: 90 });
    expect(out.closed).toBeNull();
  });

  it("partially closes a long with a smaller opposing sell, at a profit", () => {
    const out = applyFill({ side: "long", qty: 10, avgEntryPrice: 100 }, "sell", 4, 120);
    expect(out.position).toEqual({ side: "long", qty: 6, avgEntryPrice: 100 });
    expect(out.closed).toEqual({ qty: 4, entryPrice: 100, exitPrice: 120, realizedPl: 80 });
  });

  it("partially closes a short with a smaller opposing buy, at a profit", () => {
    const out = applyFill({ side: "short", qty: 10, avgEntryPrice: 100 }, "buy", 4, 80);
    expect(out.position).toEqual({ side: "short", qty: 6, avgEntryPrice: 100 });
    expect(out.closed).toEqual({ qty: 4, entryPrice: 100, exitPrice: 80, realizedPl: 80 });
  });

  it("fully closes a long at a loss when the opposing sell matches the qty exactly", () => {
    const out = applyFill({ side: "long", qty: 10, avgEntryPrice: 100 }, "sell", 10, 90);
    expect(out.position).toBeNull();
    expect(out.closed).toEqual({ qty: 10, entryPrice: 100, exitPrice: 90, realizedPl: -100 });
  });

  it("closes and flips to the opposite side when the fill overshoots what was held", () => {
    const out = applyFill({ side: "long", qty: 10, avgEntryPrice: 100 }, "sell", 15, 90);
    expect(out.position).toEqual({ side: "short", qty: 5, avgEntryPrice: 90 });
    expect(out.closed).toEqual({ qty: 10, entryPrice: 100, exitPrice: 90, realizedPl: -100 });
  });

  it("closes a short and flips to long when the fill overshoots what was held", () => {
    const out = applyFill({ side: "short", qty: 10, avgEntryPrice: 100 }, "buy", 15, 110);
    expect(out.position).toEqual({ side: "long", qty: 5, avgEntryPrice: 110 });
    expect(out.closed).toEqual({ qty: 10, entryPrice: 100, exitPrice: 110, realizedPl: -100 });
  });
});
