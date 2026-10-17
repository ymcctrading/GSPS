/**
 * The old-level buying point (Gann's double and triple bottoms, PLAN.md item 5
 * step 2; W006 pp.11, 20, 46) wired through the live surfaces: the order rests
 * at the old bottom with nothing to cross first, and is off once a close goes
 * through the stop 3 points under it. Shorts mirror at old tops.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";

const readEntryConfirmationNow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/confirmNow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/confirmNow")>("@/lib/lifecycle/confirmNow");
  return { ...actual, readEntryConfirmationNow };
});
const getTradePlan = vi.hoisted(() => vi.fn());
const listTradePlans = vi.hoisted(() => vi.fn());
const applyEventAndPersist = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/store")>("@/lib/lifecycle/store");
  return { ...actual, getTradePlan, listTradePlans, applyEventAndPersist };
});

import { confirmationFromBars } from "@/lib/lifecycle/confirmNow";
import { advanceEntryConfirmation, entryReady, freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { entryConfirmationRefusal, type OrderInput } from "@/lib/trade/place-order";
import { advanceEntryConfirmationForSymbol } from "@/lib/lifecycle/advanceConfirmation";
import { readBreakaway } from "@/lib/gann/breakaway";
import { computeGannEntryTrigger, computeGannOldLevelEntry, selectGannEntry } from "@/lib/gann/entryTrigger";
import { entryCrossedLevel } from "@/lib/trade/gann-exit-live";
import { computeTradeLevels, gannEntrySource } from "@/lib/strat/levels";

const bar = (t: string, c: number): Bar => ({ t, o: c, h: c + 0.2, l: c - 0.2, c, v: 1 });

describe("the old-level entry is ready with nothing to cross", () => {
  // Old bottom 100, stop 95.
  it("waits with no bars and above the level, and is ready (at the market) once a bar comes back to it", () => {
    expect(confirmationFromBars([], "bullish", 100, 95, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 102)], "bullish", 100, 95, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 100.1)], "bullish", 100, 95, "oldLevel").ready).toBe(true);
  });

  it("is off once a close has gone through the stop", () => {
    const r = confirmationFromBars([bar("2026-10-15T14:30:00Z", 94.9)], "bullish", 100, 95, "oldLevel");
    expect(r).toMatchObject({ ready: false, stage: "dead" });
  });

  it("is the mirror for a short at an old top", () => {
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 98)], "bearish", 100, 105, "oldLevel").ready).toBe(false);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 99.9)], "bearish", 100, 105, "oldLevel").ready).toBe(true);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 105.1)], "bearish", 100, 105, "oldLevel").stage).toBe("dead");
  });

  it("is not the crossing rule: the same pair as a crossing is not ready below its line", () => {
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 102)], "bullish", 100, 95).ready).toBe(false);
  });

  it("arms the plan's evidence on the first bar above the stop", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100, stopPrice: 95, entryKind: "oldLevel" as const };
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-10-15T14:30:00Z", 103)))).toBe(true);
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-10-15T14:30:00Z", 94)))).toBe(false);
  });

  it("never arms once a close has gone through the stop, as the placement check reads it", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100, stopPrice: 95, entryKind: "oldLevel" as const };
    const bars = [bar("2026-10-15T14:30:00Z", 94), bar("2026-10-15T14:45:00Z", 99)];
    const evidence = bars.reduce((e, b) => advanceEntryConfirmation(e, rule, b), freshEntryConfirmation());
    expect(entryReady(evidence)).toBe(false);
    expect(confirmationFromBars(bars, "bullish", 100, 95, "oldLevel").stage).toBe("dead");
  });

  it("is the mirror for a short: armed on a close under the stop, never after one over it", () => {
    const rule = { direction: "bearish" as const, entryTrigger: 100, stopPrice: 105, entryKind: "oldLevel" as const };
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-10-15T14:30:00Z", 98)))).toBe(true);
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-10-15T14:30:00Z", 106)))).toBe(false);
    const bars = [bar("2026-10-15T14:30:00Z", 106), bar("2026-10-15T14:45:00Z", 101)];
    expect(entryReady(bars.reduce((e, b) => advanceEntryConfirmation(e, rule, b), freshEntryConfirmation()))).toBe(false);
  });
});

describe("the plan's levels carry the kind", () => {
  it("for stocks and crypto alike, at the old bottom with the stop 3 points under", () => {
    const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
    const closes = [...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 44, 4)];
    const daily = closes.map((c, i) => bar(new Date(Date.UTC(2026, 2, 2) + i * 86_400_000).toISOString(), c));
    const t = computeGannOldLevelEntry(daily, "bullish")!;
    for (const assetClass of ["us_equity", "crypto"] as const) {
      const l = computeTradeLevels(gannEntrySource(t), daily[daily.length - 1], [], undefined, 0.4, assetClass, false, [t.level - 9, 52, 56]);
      expect(l.entryKind).toBe("oldLevel");
      expect(l.entry).toBeCloseTo(t.level, 2);
      expect(l.stopLoss).toBeCloseTo(t.reactionStop, 2);
    }
  });
});

describe("placement passes the plan's kind to the confirmation", () => {
  beforeEach(() => {
    readEntryConfirmationNow.mockReset().mockResolvedValue({ ready: true, stage: "confirmed", note: "" });
    getTradePlan.mockReset();
  });
  const supabase = { from: () => ({}) } as unknown as SupabaseClient;

  it("from a stored plan", async () => {
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "sig-1", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryKind: "oldLevel", entryTrigger: 100, invalidation: 95 },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 100, attachLevels: { stopLoss: 95, takeProfit: 110 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000003",
    };
    expect(await entryConfirmationRefusal(supabase, "u1", order)).toBeNull();
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ entryKind: "oldLevel", stopPrice: 95 }));
  });

  it("from an advised order with no plan", async () => {
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 100, entryStop: 95, entryKind: "oldLevel", intradaySourced: false,
    };
    await entryConfirmationRefusal(supabase, "u1", order);
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ entryKind: "oldLevel", entryTrigger: 100, stopPrice: 95 }));
  });
});

describe("an old-level plan arms on the scan tick", () => {
  beforeEach(() => {
    listTradePlans.mockReset();
    applyEventAndPersist.mockReset().mockResolvedValue({ ok: true });
  });

  it("arms at once, with no crossing", async () => {
    listTradePlans.mockResolvedValue([
      {
        planId: "p1", signalId: "sig-1", instrument: "AAPL", direction: "bullish",
        coordinates: { entryKind: "oldLevel", entryTrigger: 100, invalidation: 95 },
        entryConfirmation: freshEntryConfirmation(),
      },
    ]);
    await advanceEntryConfirmationForSymbol({} as never, "u1", {
      symbol: "AAPL", direction: "bullish", currentPrice: 101, scannedAt: "2026-10-15T15:00:00Z",
    });
    const arm = applyEventAndPersist.mock.calls.find((c) => c[3].type === "arm");
    expect(arm).toBeDefined();
    expect(arm![3].reason).toMatch(/old level/);
  });
});

describe("an old-level entry inside a sideways range", () => {
  it("is not held to Watch by the breakaway rule", () => {
    // Bottoms alternate between 95 and a dip more than 3 points under it, so
    // the last bottom at 95 is a fresh level (a fourth test would not be a
    // buy at all) inside the range.
    const sideways: number[] = [];
    let from = 95;
    for (let k = 0; k < 6; k++) {
      const top = k % 2 === 0 ? 105 : 103;
      const bottom = k % 2 === 0 ? 89 : 95;
      for (let i = 1; i <= 5; i++) sideways.push(from + ((top - from) * i) / 5);
      for (let i = 1; i <= 5; i++) sideways.push(top - ((top - bottom) * i) / 5);
      from = bottom;
    }
    // End on a rally off the last bottom, so that bottom is untested.
    const closes = [...sideways, 96, 97, 98, 99];
    const daily: Bar[] = closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }));
    const t = computeGannOldLevelEntry(daily, "bullish")!;
    expect(t).not.toBeNull();
    const r = readBreakaway(daily, t);
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(true);
  });
});

describe("the live exit of an old-level buy", () => {
  it("reads no crossed level, even with an older crossed top still held under it", () => {
    // A top at 40 crossed by 3 points and never bought back to, then a bottom
    // near 44 and a reaction toward it: the scan prices the old bottom.
    const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
    const closes = [...leg(30, 40, 10), ...leg(40, 36, 4), ...leg(36, 47, 10), ...leg(47, 44, 4), ...leg(44, 49, 6), ...leg(49, 46, 4)];
    const daily = closes.map((c, i) => bar(new Date(Date.UTC(2026, 2, 2) + i * 86_400_000).toISOString(), c));
    const sel = selectGannEntry(daily, "bullish")!;
    expect(sel.kind).toBe("oldLevel");
    const held = computeGannEntryTrigger(daily, "bullish")!;
    expect(held.held).toBe(true);
    expect(held.level).toBeLessThan(sel.level);
    const next = new Date(Date.parse(daily[daily.length - 1].t) + 86_400_000).toISOString();
    // Bought at the old bottom: no breakout to hold, only the stop.
    expect(entryCrossedLevel("long", sel.reactionEntry, next, daily)).toBeNull();
  });
});
