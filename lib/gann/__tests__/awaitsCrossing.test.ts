/**
 * A crossing's plan says whether the crossing is made (W006 Rule 3(b)-(c),
 * pp. 46-47): until a daily close 3 points past the level, the reaction entry
 * waits, and the intraday "Daily plan's level held" alert must not time it
 * (`TradeLevels.entryAwaitsCrossing`, 2026-10-22).
 */

import { describe, expect, it } from "vitest";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { gannEntrySource } from "@/lib/strat/levels";

const crossing = (held: boolean): GannEntryTrigger =>
  ({
    kind: "crossing",
    direction: "bullish",
    triggerPrice: 103,
    stopPrice: 97,
    pivot: { index: 5, price: 100, kind: "top" },
    level: 100,
    reactionEntry: 101,
    reactionStop: 97,
    protectivePivot: { index: 3, price: 95, kind: "bottom" },
    held,
    crossedAt: held ? "2026-10-20T04:00:00Z" : null,
    swingDays: 3,
    source: "swing",
    formedAt: "2026-10-10T04:00:00Z",
  }) as unknown as GannEntryTrigger;

describe("entryAwaitsCrossing", () => {
  it("flags a crossing not yet made, and only that", () => {
    expect(gannEntrySource(crossing(false)).entryAwaitsCrossing).toBe(true);
    expect(gannEntrySource(crossing(true)).entryAwaitsCrossing).toBeUndefined();
    const oldLevel = { ...crossing(true), kind: "oldLevel" } as unknown as GannEntryTrigger;
    expect(gannEntrySource(oldLevel).entryAwaitsCrossing).toBeUndefined();
  });
});
