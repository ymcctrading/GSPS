/**
 * The held-bottom buying point (PLAN.md item 5, step 4; W006 pp.20, 24,
 * 46-47) wired through every surface: like the double or triple bottom, the
 * order rests with nothing to cross first, at the last close, and is off once
 * a close goes through the stop 3 points under the low that held.
 */
import { readFileSync } from "node:fs";
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
import { entryConfirmationRefusal, OrderSchema, type OrderInput } from "@/lib/trade/place-order";
import { advanceEntryConfirmationForSymbol } from "@/lib/lifecycle/advanceConfirmation";
import { readBreakaway } from "@/lib/gann/breakaway";
import { computeGannHoldEntry, selectGannEntry } from "@/lib/gann/entryTrigger";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { entryCrossedLevel } from "@/lib/trade/gann-exit-live";
import { computeTradeLevels, gannEntrySource } from "@/lib/strat/levels";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { replay } from "@/lib/backtest/replay";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";

const bar = (t: string, c: number): Bar => ({ t, o: c, h: c + 0.2, l: c - 0.2, c, v: 1 });
const DAY_MS = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
const flat = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? hi : lo));
function daily(closes: number[], start = "2026-03-02", half = 0.3): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY_MS).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
// A decline, a top at 110, a reaction to 100, and nine days over the low.
const HELD = daily([...leg(140, 90, 25), ...leg(90, 110, 10), ...leg(110, 100, 5), ...flat(100.6, 101.4, 9)]);
const T = computeGannHoldEntry(HELD, "bullish")!;

describe("the kind rests with nothing to cross", () => {
  it("is one of the kinds that rest, as the old level is and the crossing is not", () => {
    expect(restsWithoutCrossing("hold")).toBe(true);
    expect(restsWithoutCrossing("oldLevel")).toBe(true);
    expect(restsWithoutCrossing("crossing")).toBe(false);
    expect(restsWithoutCrossing(undefined)).toBe(false);
  });

  it("is ready with bars above the stop, off once a close goes through it, and mirrored", () => {
    expect(confirmationFromBars([], "bullish", 101, 95, "hold").ready).toBe(true);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 102)], "bullish", 101, 95, "hold").ready).toBe(true);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 94.9)], "bullish", 101, 95, "hold")).toMatchObject({ ready: false, stage: "dead" });
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 98)], "bearish", 99, 105, "hold").ready).toBe(true);
    expect(confirmationFromBars([bar("2026-10-15T14:30:00Z", 105.1)], "bearish", 99, 105, "hold").stage).toBe("dead");
  });

  it("says the bottom held, not a double or triple bottom", () => {
    expect(confirmationFromBars([], "bullish", 101, 95, "hold").note).toMatch(/held/);
    expect(confirmationFromBars([], "bullish", 101, 95, "hold").note).not.toMatch(/double|triple/);
  });

  it("arms the plan's evidence on the first bar above the stop, never after a close through it", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 101, stopPrice: 95, entryKind: "hold" as const };
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-10-15T14:30:00Z", 103)))).toBe(true);
    const bars = [bar("2026-10-15T14:30:00Z", 94), bar("2026-10-15T14:45:00Z", 99)];
    expect(entryReady(bars.reduce((e, b) => advanceEntryConfirmation(e, rule, b), freshEntryConfirmation()))).toBe(false);
  });
});

describe("the plan's levels carry the kind and the rule that found it", () => {
  it("for stocks and crypto alike, at the last close with the stop 3 points under the low", () => {
    for (const assetClass of ["us_equity", "crypto"] as const) {
      const l = computeTradeLevels(gannEntrySource(T), HELD[HELD.length - 1], [], undefined, 0.4, assetClass, false, [90, 115, 120]);
      expect(l.entryKind).toBe("hold");
      expect(l.holdBasis).toBe("weeks");
      expect(l.entry).toBeCloseTo(T.reactionEntry, 2);
      expect(l.stopLoss).toBeCloseTo(T.reactionStop, 2);
    }
  });

  it("names it a single bottom, and a single top for a short", () => {
    expect(gannEntrySource(T).setupLabel).toBe("single bottom");
    expect(gannEntrySource({ ...T, direction: "bearish" }).setupLabel).toBe("single top");
    expect(gannEntrySource({ ...T, holdBasis: "record" }).setupLabel).toBe("record low that held");
  });
});

describe("placement passes the kind to the confirmation", () => {
  beforeEach(() => {
    readEntryConfirmationNow.mockReset().mockResolvedValue({ ready: true, stage: "confirmed", note: "" });
    getTradePlan.mockReset();
  });
  const supabase = { from: () => ({}) } as unknown as SupabaseClient;

  it("from a stored plan", async () => {
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "sig-1", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryKind: "hold", entryTrigger: 101, invalidation: 95 },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 101, attachLevels: { stopLoss: 95, takeProfit: 110 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000003",
    };
    expect(await entryConfirmationRefusal(supabase, "u1", order)).toBeNull();
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ entryKind: "hold", stopPrice: 95 }));
  });

  it("from an advised order with no plan, through the order form's schema", async () => {
    const order = OrderSchema.parse({
      symbol: "AAPL", side: "buy", qty: 1, entryMode: "advised", limitPrice: 101, entryStop: 95, entryKind: "hold",
    }) as OrderInput;
    expect(order.entryKind).toBe("hold");
    await entryConfirmationRefusal(supabase, "u1", order);
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ entryKind: "hold", entryTrigger: 101, stopPrice: 95 }));
  });
});

describe("a held-bottom plan arms on the scan tick", () => {
  beforeEach(() => {
    listTradePlans.mockReset();
    applyEventAndPersist.mockReset().mockResolvedValue({ ok: true });
  });

  it("arms at once, saying the bottom held", async () => {
    listTradePlans.mockResolvedValue([
      {
        planId: "p1", signalId: "sig-1", instrument: "AAPL", direction: "bullish",
        coordinates: { entryKind: "hold", entryTrigger: 101, invalidation: 95 },
        entryConfirmation: freshEntryConfirmation(),
      },
    ]);
    await advanceEntryConfirmationForSymbol({} as never, "u1", {
      symbol: "AAPL", direction: "bullish", currentPrice: 101.5, scannedAt: "2026-10-15T15:00:00Z",
    });
    const arm = applyEventAndPersist.mock.calls.find((c) => c[3].type === "arm");
    expect(arm).toBeDefined();
    expect(arm![3].reason).toMatch(/held/);
  });
});

describe("a held bottom inside a sideways range", () => {
  it("is treated as the old level is: the bottom is the range's own edge", () => {
    // Swings between 95 and 105, then the last low held into its second week.
    const sideways: number[] = [];
    let from = 100;
    for (let k = 0; k < 6; k++) {
      sideways.push(...leg(from, 105, 5), ...leg(105, 95, 5));
      from = 95;
    }
    const bars = daily([...sideways, ...flat(95.6, 96.4, 9)], "2026-01-01", 0.5);
    const t = computeGannHoldEntry(bars, "bullish")!;
    expect(t?.kind).toBe("hold");
    const r = readBreakaway(bars, t);
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(true);
  });
});

describe("the live exit of a held-bottom buy", () => {
  it("reads no crossed level: there was no breakout to hold, only the stop", () => {
    expect(selectGannEntry(HELD, "bullish")?.kind).toBe("hold");
    const next = new Date(Date.parse(HELD[HELD.length - 1].t) + DAY_MS).toISOString();
    expect(entryCrossedLevel("long", T.reactionEntry, next, HELD)).toBeNull();
  });
});

describe("the replay buys a held bottom at the last close", () => {
  const DAY = "2026-06-15";
  // A falling market (each rally shorter than the leg before it, so the trend
  // reads down), then a 6% drop and nine days over its low, ending the day
  // before the session. The reversion pass arms a long.
  const start = new Date(Date.parse(`${DAY}T00:00:00Z`) - 300 * DAY_MS);
  const closes: number[] = [];
  let c = 300;
  for (let k = 0; k < 286; k++) {
    c *= k % 10 < 6 ? 0.994 : 1 + 0.004 * (1 - (0.5 * k) / 300);
    closes.push(c);
  }
  closes.push(...leg(c, c * 0.94, 5), ...flat(c * 0.94 * 1.004, c * 0.94 * 1.008, 9));
  const DAILY: Bar[] = closes.map((x, i) => ({
    t: new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10) + "T00:00:00Z",
    o: x, h: x * 1.002, l: x * 0.998, c: x, v: 1000,
  }));
  const H = selectGannEntry(DAILY, "bullish")!;
  const stamp = (i: number) => `${DAY}T${String(Math.floor((i * 15) / 60)).padStart(2, "0")}:${String((i * 15) % 60).padStart(2, "0")}:00Z`;
  const candle = (x: number, half = 0.05) => ({ o: x, h: x + half, l: x - half, c: x });
  const session = (tail: Array<ReturnType<typeof candle>>) =>
    [...Array.from({ length: 44 }, () => candle(H.reactionEntry * 1.004)), ...tail].map((b, i) => ({ ...b, t: stamp(i), v: 1000 }));

  it("selects the held bottom on the day before the session", () => {
    expect(DAILY[DAILY.length - 1].t.slice(0, 10) < DAY).toBe(true);
    expect(H.kind).toBe("hold");
    expect(H.reactionEntry).toBeCloseTo(DAILY[DAILY.length - 1].c, 8);
    expect(H.reactionStop).toBeCloseTo(H.level - gannThreePoints(H.level), 8);
  });

  it("buys when price trades at the last close, with the stop 3 points under the low", () => {
    const r = replay("TEST", session([candle(H.reactionEntry + 0.03), candle(H.reactionEntry * 1.004)]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeCloseTo(H.reactionEntry, 6);
    expect(r.trades[0].stop).toBeCloseTo(H.reactionStop, 6);
    expect(r.trades[0].entryKind).toBe("hold");
  });

  it("buys at the open when the session opens under the last close, with nothing to cross first", () => {
    const under = Array.from({ length: 46 }, (_, i) => ({ ...candle(H.reactionEntry * 0.997), t: stamp(i), v: 1000 }));
    const r = replay("TEST", under, { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeLessThan(H.reactionEntry);
  });

  it("does not buy while price stays over the last close", () => {
    const r = replay("TEST", session([candle(H.reactionEntry * 1.004), candle(H.reactionEntry * 1.004)]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(0);
  });
});

describe("the score's note", () => {
  it("names the held bottom and its stop, and the record low when that is what held", () => {
    const trend = { timeframe: "1Day" as const, direction: "sideways" as const, support: [], resistance: [] };
    const note = (gannTrigger: ScoreInputs["gannTrigger"]) =>
      computeScore({
        direction: gannTrigger!.direction,
        macroTrends: [trend, trend, trend],
        hourlyTrend: trend,
        gann: {
          fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false,
          timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [],
        },
        nearSupportResistance: false,
        pattern: null,
        gannTrigger,
        momentumElevated: false,
        stopAtrMultiple: 0.8,
        levels: null,
      }).breakdown.find((b) => b.key === "entryTriggerArmed")!.note;
    const held = { triggerPrice: 101, stopPrice: 94.7, direction: "bullish" as const, kind: "hold" as const, level: 99.7, holdBasis: "weeks" as const };
    expect(note(held)).toMatch(/low at 99\.70 has held/);
    expect(note(held)).toMatch(/3 points under it/);
    expect(note(held)).not.toMatch(/double|triple|crosses/);
    expect(note({ ...held, holdBasis: "record" })).toMatch(/record low/);
    expect(note({ ...held, direction: "bearish", stopPrice: 104.7, level: 100.3 })).toMatch(/high at 100\.30 has held/);
  });
});

describe("the stored kind", () => {
  it("is allowed by migration 0086's check, as every kind the code writes is", () => {
    const sql = readFileSync("supabase/migrations/0086_trade_plan_entry_kind.sql", "utf8");
    for (const kind of ["crossing", "oldLevel", "hold"]) expect(sql).toMatch(new RegExp(`'${kind}'`));
  });
});
