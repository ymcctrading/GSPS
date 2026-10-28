import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShadowOutcome } from "@/lib/shadow/evaluate";

const { walkShadowRowsMock } = vi.hoisted(() => ({ walkShadowRowsMock: vi.fn() }));
vi.mock("@/lib/shadow/evaluate", () => ({ walkShadowRows: walkShadowRowsMock }));

import { MAX_WALKS_ON_RECORD, WALK_ON_RECORD_TIMEOUT_MS, buildShadowSignal, recordShadowSignals, shadowTradeSession } from "@/lib/shadow/record";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import { shadowSessionComplete } from "@/lib/shadow/session";
import type { ScanResult } from "@/lib/types";

function baseResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: "2026-08-28T14:30:00Z",
    currentPrice: 200,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: false,
    stopAtrMultiple: 0.8,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
    pattern: { name: "2-2", direction: "bullish", triggerPrice: 200, stopPrice: 195 } as ScanResult["pattern"],
    armedPatterns: [],
    levels: {
      entry: 200,
      stopLoss: 195,
      takeProfit1: 205,
      takeProfit2: 215,
      masterProfit: 215,
      riskPerShare: 5,
      rewardToRiskTp1: 1,
      rewardToRiskTp2: 3,
      rewardToRiskMaster: 3,
      stopPctOfPrice: 2.5,
      stopBandWarning: null,
      stateNote: null,
    },
    decision: { score: 7, outputState: "Execute", breakdown: [] },
    ...overrides,
  } as ScanResult;
}

describe("buildShadowSignal", () => {
  it("builds a row for an Execute-tier, fully priced result", () => {
    const row = buildShadowSignal(baseResult(), "scheduled_morning_scan");
    expect(row).toEqual({
      symbol: "AAPL",
      direction: "bullish",
      pattern: "2-2",
      strategyVersion: STRATEGY_VERSION,
      entry: 200,
      stopLoss: 195,
      target: 215,
      score: 7,
      source: "scheduled_morning_scan",
      scannedAt: "2026-08-28T14:30:00Z",
      sessionDate: "2026-08-28",
    });
  });

  it("returns null for a Watch/Reject verdict", () => {
    const watch = baseResult({ decision: { score: 5, outputState: "Watch", breakdown: [] } });
    expect(buildShadowSignal(watch, "x")).toBeNull();
  });

  it("returns null when the scan errored", () => {
    expect(buildShadowSignal(baseResult({ error: "provider timeout" }), "x")).toBeNull();
  });

  it("returns null with no priced plan", () => {
    expect(buildShadowSignal(baseResult({ levels: null }), "x")).toBeNull();
  });

  it("returns null with no clear direction", () => {
    expect(buildShadowSignal(baseResult({ direction: "none" }), "x")).toBeNull();
  });
});

describe("recordShadowSignals", () => {
  it("upserts only the Execute-tier rows and reports the count", async () => {
    const upserted: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (rows: unknown[]) => {
          upserted.push(...rows);
          return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `r${i}` })), error: null }) };
        },
      }),
    } as unknown as SupabaseClient;

    const results = [
      baseResult({ symbol: "AAPL" }),
      baseResult({ symbol: "TSLA", decision: { score: 4, outputState: "Watch", breakdown: [] } }),
    ];
    const outcome = await recordShadowSignals(client, results, "scheduled_morning_scan");
    expect(outcome.recorded).toBe(1);
    expect(upserted).toHaveLength(1);
    expect((upserted[0] as { symbol: string }).symbol).toBe("AAPL");
  });

  it("is a no-op when nothing qualifies", async () => {
    const client = {
      from: () => ({ upsert: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
    } as unknown as SupabaseClient;
    const outcome = await recordShadowSignals(
      client,
      [baseResult({ decision: { score: 4, outputState: "Watch", breakdown: [] } })],
      "x",
    );
    expect(outcome.recorded).toBe(0);
  });

  it("records a plan still being walked once, not once per scan", async () => {
    const upserted: { symbol: string }[] = [];
    const first = buildShadowSignal(baseResult({ symbol: "AAPL" }), "x")!;
    const chain = {
      eq: () => chain,
      is: () => chain,
      in: () =>
        Promise.resolve({
          data: [{ symbol: "AAPL", direction: first.direction, entry: String(first.entry), stop_loss: String(first.stopLoss) }],
          error: null,
        }),
    };
    const client = {
      from: () => ({
        select: () => chain,
        upsert: (rows: { symbol: string }[]) => {
          upserted.push(...rows);
          return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `r${i}` })), error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    const outcome = await recordShadowSignals(client, [baseResult({ symbol: "AAPL" }), baseResult({ symbol: "MSFT" })], "x");
    expect(outcome.recorded).toBe(1);
    expect(upserted.map((r) => r.symbol)).toEqual(["MSFT"]);
  });

  it("swallows a write failure and reports zero recorded", async () => {
    const client = {
      from: () => ({ upsert: () => ({ select: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }),
    } as unknown as SupabaseClient;
    const outcome = await recordShadowSignals(client, [baseResult()], "x");
    expect(outcome.recorded).toBe(0);
  });
});

describe("recordShadowSignals: one call a plan a session", () => {
  function capture(insertedCount?: number) {
    const calls: { rows: Record<string, unknown>[]; options: Record<string, unknown> }[] = [];
    const client = {
      from: () => ({
        upsert: (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
          calls.push({ rows, options });
          const n = insertedCount ?? rows.length;
          return { select: () => Promise.resolve({ data: rows.slice(0, n).map((_, i) => ({ id: `r${i}` })), error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it("writes the session and keys the upsert on the plan and its session", async () => {
    const { client, calls } = capture();
    await recordShadowSignals(client, [baseResult({ scannedAt: "2026-10-19T21:58:59Z" })], "x");
    expect(calls[0].rows[0]).toMatchObject({ session_date: "2026-10-20" });
    expect(calls[0].options).toEqual({
      onConflict: "strategy_version,symbol,direction,entry,stop_loss,session_date",
      ignoreDuplicates: true,
    });
  });

  it("sends one row when a batch holds the same plan twice for one session", async () => {
    const { client, calls } = capture();
    const out = await recordShadowSignals(
      client,
      [baseResult({ scannedAt: "2026-10-19T20:28:58Z" }), baseResult({ scannedAt: "2026-10-19T21:58:59Z" })],
      "x",
    );
    expect(calls[0].rows).toHaveLength(1);
    expect(out.recorded).toBe(1);
  });

  it("counts only the rows the index let in, not a repeat it set aside", async () => {
    const { client } = capture(0);
    const out = await recordShadowSignals(client, [baseResult()], "x");
    expect(out.recorded).toBe(0);
  });
});

describe("shadowTradeSession (chosen at night, traded the next session)", () => {
  it("trades the same session when recorded before the close, a pre-market scan included", () => {
    expect(shadowTradeSession("2026-10-22T10:30:20Z", "BP")).toBe("2026-10-22"); // 6:30 AM ET
    expect(shadowTradeSession("2026-10-22T19:59:00Z", "BP")).toBe("2026-10-22"); // 3:59 PM ET
  });

  it("trades the next session when recorded at or after the close", () => {
    expect(shadowTradeSession("2026-10-22T20:00:00Z", "BP")).toBe("2026-10-23"); // 4:00 PM ET
    expect(shadowTradeSession("2026-10-20T00:36:00Z", "BP")).toBe("2026-10-20"); // 8:36 PM ET on the 19th
  });

  it("skips the weekend and a market holiday", () => {
    expect(shadowTradeSession("2026-10-16T20:29:17Z", "IWM")).toBe("2026-10-19"); // Friday evening
    expect(shadowTradeSession("2026-10-17T15:00:00Z", "IWM")).toBe("2026-10-19"); // Saturday
    expect(shadowTradeSession("2026-11-25T22:00:00Z", "IWM")).toBe("2026-11-27"); // over Thanksgiving
  });

  it("reads an early close at 1:00 PM", () => {
    expect(shadowTradeSession("2026-11-27T17:30:00Z", "IWM")).toBe("2026-11-27"); // 12:30 PM ET
    expect(shadowTradeSession("2026-11-27T18:30:00Z", "IWM")).toBe("2026-11-30"); // 1:30 PM ET
  });

  it("keeps crypto on the New York day it was recorded in", () => {
    expect(shadowTradeSession("2026-10-17T23:00:00Z", "BTC/USD")).toBe("2026-10-17");
  });
});

describe("recordShadowSignals: a later session's call against an earlier row", () => {
  function withOpen(openRows: Record<string, unknown>[]) {
    const upserted: { symbol: string }[] = [];
    const chain = {
      eq: () => chain,
      is: () => chain,
      in: () => Promise.resolve({ data: openRows, error: null }),
    };
    const client = {
      from: () => ({
        select: () => chain,
        upsert: (rows: { symbol: string }[]) => {
          upserted.push(...rows);
          return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `r${i}` })), error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, upserted };
  }
  // Monday evening's scan: the plan trades Tuesday 2026-10-20. Monday's
  // session is over by the time the test runs.
  const evening = baseResult({ scannedAt: "2026-10-19T21:58:59Z" });
  const plan = { id: "e1", symbol: "AAPL", direction: "bullish", entry: "200", stop_loss: "195", scanned_at: "2026-10-19T15:00:00Z" };
  const outcome = (o: Partial<ShadowOutcome>): ShadowOutcome => ({ outcome: "pending", rMultiple: null, barsHeld: null, fillPrice: null, ...o });

  beforeEach(() => {
    walkShadowRowsMock.mockReset();
  });

  it("walks an unread earlier row first, and records the next session's call when it never filled (a plan lasts its session)", async () => {
    walkShadowRowsMock.mockResolvedValue(new Map([["e1", outcome({ outcome: "expired" })]]));
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    expect((await recordShadowSignals(client, [evening], "x")).recorded).toBe(1);
    expect(walkShadowRowsMock).toHaveBeenCalledTimes(1);
    expect(upserted).toHaveLength(1);
  });

  it("does not record a trade the walk finds on as a new call (filled in its session, still held)", async () => {
    walkShadowRowsMock.mockResolvedValue(new Map([["e1", outcome({ fillPrice: 199.5, filled: true })]]));
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    expect((await recordShadowSignals(client, [evening], "x")).recorded).toBe(0);
    expect(upserted).toHaveLength(0);
  });

  it("does not record when the fill came on the session's last bar and its price is not known yet", async () => {
    walkShadowRowsMock.mockResolvedValue(new Map([["e1", outcome({ filled: true })]]));
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    await recordShadowSignals(client, [evening], "x");
    expect(upserted).toHaveLength(0);
  });

  it("holds back when the earlier row can't be read", async () => {
    walkShadowRowsMock.mockResolvedValue(new Map([["e1", null]]));
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    await recordShadowSignals(client, [evening], "x");
    expect(upserted).toHaveLength(0);
  });

  it("holds back, without a read, a row with a fill already written", async () => {
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: "199.5" }]);
    expect((await recordShadowSignals(client, [evening], "x")).recorded).toBe(0);
    expect(walkShadowRowsMock).not.toHaveBeenCalled();
    expect(upserted).toHaveLength(0);
  });

  it("holds the next session's call back while the closed session's last bars are still on their way", async () => {
    // 4:10 PM ET: Monday's session has closed, its last delayed bars have not arrived.
    const justAfter = baseResult({ scannedAt: "2026-10-19T20:10:00Z" });
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    expect((await recordShadowSignals(client, [justAfter], "x", new Date("2026-10-19T20:10:30Z"))).recorded).toBe(0);
    expect(walkShadowRowsMock).not.toHaveBeenCalled();
    expect(upserted).toHaveLength(0);
  });

  it("walks the closed session's row once its last bars are in (4:20 PM ET and after)", async () => {
    walkShadowRowsMock.mockResolvedValue(new Map([["e1", outcome({ outcome: "expired" })]]));
    const later = baseResult({ scannedAt: "2026-10-19T20:25:00Z" });
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
    expect((await recordShadowSignals(client, [later], "x", new Date("2026-10-19T20:25:30Z"))).recorded).toBe(1);
    expect(walkShadowRowsMock).toHaveBeenCalledTimes(1);
    expect(upserted).toHaveLength(1);
  });

  it("does not record again for a session already recorded", async () => {
    const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-20", fill_price: null }]);
    await recordShadowSignals(client, [evening], "x");
    expect(walkShadowRowsMock).not.toHaveBeenCalled();
    expect(upserted).toHaveLength(0);
  });

  it("walks at most a bounded number of earlier rows a run, and holds back the rest", async () => {
    const symbols = Array.from({ length: MAX_WALKS_ON_RECORD + 2 }, (_, i) => `S${i}`);
    walkShadowRowsMock.mockImplementation((...args: unknown[]) => {
      const rows = (args[1] ?? []) as { id: string }[];
      return Promise.resolve(new Map(rows.map((r) => [r.id, outcome({ outcome: "expired" })])));
    });
    const { client, upserted } = withOpen(
      symbols.map((symbol) => ({ ...plan, id: symbol, symbol, session_date: "2026-10-19", fill_price: null })),
    );
    await recordShadowSignals(client, symbols.map((symbol) => baseResult({ symbol, scannedAt: "2026-10-19T21:58:59Z" })), "x");
    expect(walkShadowRowsMock.mock.calls[0][1]).toHaveLength(MAX_WALKS_ON_RECORD);
    expect(upserted).toHaveLength(MAX_WALKS_ON_RECORD);
  });

  it("holds the plans back when the walk outlasts its time, rather than wait on it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      walkShadowRowsMock.mockReturnValue(new Promise(() => {}));
      const { client, upserted } = withOpen([{ ...plan, session_date: "2026-10-19", fill_price: null }]);
      const pending = recordShadowSignals(client, [evening], "x", new Date("2026-10-19T22:00:00Z"));
      await vi.advanceTimersByTimeAsync(WALK_ON_RECORD_TIMEOUT_MS + 1);
      expect((await pending).recorded).toBe(0);
      expect(upserted).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("walks the least recently checked rows first", async () => {
    const symbols = Array.from({ length: MAX_WALKS_ON_RECORD + 1 }, (_, i) => `S${i}`);
    walkShadowRowsMock.mockResolvedValue(new Map());
    const { client } = withOpen(
      symbols.map((symbol, i) => ({
        ...plan,
        id: symbol,
        symbol,
        session_date: "2026-10-19",
        fill_price: null,
        // S0 was checked most recently; the rest never or earlier.
        checked_at: i === 0 ? "2026-10-19T23:59:00Z" : i === 1 ? null : `2026-10-19T1${i}:00:00Z`,
      })),
    );
    await recordShadowSignals(client, symbols.map((symbol) => baseResult({ symbol, scannedAt: "2026-10-19T21:58:59Z" })), "x");
    const ids = (walkShadowRowsMock.mock.calls[0][1] as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain("S0");
    expect(ids[0]).toBe("S1");
  });
});

describe("shadowSessionComplete (the session's last bars have arrived)", () => {
  it("waits out the feed's delay past the close before a stock's session reads over", () => {
    // 2026-10-22 is EDT: 4:00 PM is 20:00 UTC; the delay and margin run to 4:20 PM.
    expect(shadowSessionComplete("2026-10-22", "BP", new Date("2026-10-22T20:00:30Z"))).toBe(false);
    expect(shadowSessionComplete("2026-10-22", "BP", new Date("2026-10-22T20:19:00Z"))).toBe(false);
    expect(shadowSessionComplete("2026-10-22", "BP", new Date("2026-10-22T20:20:00Z"))).toBe(true);
    // an early close: 1:00 PM EST is 18:00 UTC
    expect(shadowSessionComplete("2026-11-27", "BP", new Date("2026-11-27T18:10:00Z"))).toBe(false);
    expect(shadowSessionComplete("2026-11-27", "BP", new Date("2026-11-27T18:20:00Z"))).toBe(true);
    expect(shadowSessionComplete("2026-10-21", "BP", new Date("2026-10-22T13:00:00Z"))).toBe(true);
  });
});
