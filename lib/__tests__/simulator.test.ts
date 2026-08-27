import { describe, expect, it } from "vitest";
import { applyFill, isTriggered } from "@/lib/brokers/simulator";

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

describe("isTriggered", () => {
  // Regression: a bearish "advised price" sell (a sell-stop below the current
  // price per lib/strat/patterns.ts) was firing the instant it was armed,
  // because the market hadn't yet reached — let alone fallen through — the
  // entry, and the old marketability check ("sell fills once market >= limit")
  // is already satisfied above the entry, not below it.
  it("does not trigger a sell-stop entry while the market is still above it", () => {
    expect(isTriggered("sell", 28.21, 28.32)).toBe(false);
  });

  it("triggers a sell-stop entry once the market falls to or through it", () => {
    expect(isTriggered("sell", 28.21, 28.21)).toBe(true);
    expect(isTriggered("sell", 28.21, 28.1)).toBe(true);
  });

  it("does not trigger a buy-stop entry while the market is still below it", () => {
    expect(isTriggered("buy", 105, 104.99)).toBe(false);
  });

  it("triggers a buy-stop entry once the market rises to or through it", () => {
    expect(isTriggered("buy", 105, 105)).toBe(true);
    expect(isTriggered("buy", 105, 105.5)).toBe(true);
  });
});
