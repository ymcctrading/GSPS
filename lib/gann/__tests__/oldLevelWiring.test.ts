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
import { computeGannOldLevelEntry } from "@/lib/gann/entryTrigger";

const bar = (t: string, c: number): Bar => ({ t, o: c, h: c + 0.2, l: c - 0.2, c, v: 1 });

describe("the old-level entry is ready with nothing to cross", () => {
  // Old bottom 100, stop 95.
  it("is ready with no bars, and with bars that stay above the stop", () => {
    expect(confirmationFromBars([], "bullish", 100, 95, "oldLevel").ready).toBe(true);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 102)], "bullish", 100, 95, "oldLevel").ready).toBe(true);
  });

  it("is off once a close has gone through the stop", () => {
    const r = confirmationFromBars([bar("2026-10-15T14:30:00Z", 94.9)], "bullish", 100, 95, "oldLevel");
    expect(r).toMatchObject({ ready: false, stage: "dead" });
  });

  it("is the mirror for a short at an old top", () => {
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 98)], "bearish", 100, 105, "oldLevel").ready).toBe(true);
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
    const sideways: number[] = [];
    for (let k = 0; k < 6; k++) {
      const top = k % 2 === 0 ? 105 : 103;
      for (let i = 1; i <= 5; i++) sideways.push(95 + ((top - 95) * i) / 5);
      for (let i = 1; i <= 5; i++) sideways.push(top - ((top - 95) * i) / 5);
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
