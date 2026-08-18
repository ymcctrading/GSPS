/**
 * The caps that stop a novice one-tapping through a whole watchlist. They are
 * counted from the recommendation ledger rather than from the orders table, so
 * these pin both the counting and the day boundary it counts against.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readCapUsage } from "@/lib/guided/caps";
import { DEFAULT_GUIDED_CAPS } from "@/lib/guided/config";

interface Row {
  symbol: string;
  qty: number;
  agreed_entry: number;
  resolved_at: string | null;
}

/** The four chained filters `readCapUsage` uses, answered from a fixed list. */
function stubSupabase(rows: Row[]): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

/** 14:00 ET on 2026-08-17 (18:00 UTC) — mid-session, well inside one trading day. */
const NOW = new Date("2026-08-17T18:00:00Z");

describe("readCapUsage", () => {
  it("reports no usage and no block on an empty ledger", async () => {
    const usage = await readCapUsage(stubSupabase([]), "u1", DEFAULT_GUIDED_CAPS, 100_000, new Map(), NOW);
    expect(usage).toMatchObject({
      tradesToday: 0,
      tradesThisWeek: 0,
      deployedUsd: 0,
      blockedReason: null,
    });
  });

  it("blocks once the daily cap is reached", async () => {
    const rows: Row[] = Array.from({ length: DEFAULT_GUIDED_CAPS.maxTradesPerDay }, (_, i) => ({
      symbol: `SYM${i}`,
      qty: 1,
      agreed_entry: 10,
      resolved_at: "2026-08-17T14:00:00Z",
    }));
    const usage = await readCapUsage(stubSupabase(rows), "u1", DEFAULT_GUIDED_CAPS, 100_000, new Map(), NOW);
    expect(usage.tradesToday).toBe(DEFAULT_GUIDED_CAPS.maxTradesPerDay);
    expect(usage.blockedReason).toContain("daily cap");
  });

  it("counts by Eastern trading day, not by UTC date", async () => {
    // 20:30 ET on the 16th is 00:30 UTC on the 17th. It belongs to the previous
    // session, so it must not count against today's cap.
    const usage = await readCapUsage(
      stubSupabase([{ symbol: "AAPL", qty: 1, agreed_entry: 10, resolved_at: "2026-08-17T00:30:00Z" }]),
      "u1",
      DEFAULT_GUIDED_CAPS,
      100_000,
      new Map(),
      NOW,
    );
    expect(usage.tradesToday).toBe(0);
    expect(usage.tradesThisWeek).toBe(1);
  });

  it("counts deployed capital only for guided positions still open, at their entry price", async () => {
    const rows: Row[] = [
      { symbol: "AAPL", qty: 10, agreed_entry: 200, resolved_at: "2026-08-17T14:00:00Z" },
      // Executed, but the position has since been closed — nothing is tied up.
      { symbol: "MSFT", qty: 10, agreed_entry: 400, resolved_at: "2026-08-14T14:00:00Z" },
    ];
    const open = new Map([["AAPL", { qty: 10, avgEntry: 205 }]]);
    const usage = await readCapUsage(stubSupabase(rows), "u1", DEFAULT_GUIDED_CAPS, 100_000, open, NOW);
    expect(usage.deployedUsd).toBeCloseTo(2050, 6);
    expect(usage.deployedPct).toBeCloseTo(2.05, 6);
  });

  it("counts a symbol once even when it was recommended more than once", async () => {
    const rows: Row[] = [
      { symbol: "AAPL", qty: 10, agreed_entry: 200, resolved_at: "2026-08-17T14:00:00Z" },
      { symbol: "AAPL", qty: 10, agreed_entry: 200, resolved_at: "2026-08-15T14:00:00Z" },
    ];
    const open = new Map([["AAPL", { qty: 20, avgEntry: 200 }]]);
    const usage = await readCapUsage(stubSupabase(rows), "u1", DEFAULT_GUIDED_CAPS, 1_000_000, open, NOW);
    expect(usage.deployedUsd).toBeCloseTo(4000, 6);
  });

  it("blocks when the deployed-capital cap is reached", async () => {
    const rows: Row[] = [{ symbol: "AAPL", qty: 100, agreed_entry: 300, resolved_at: "2026-08-12T14:00:00Z" }];
    const open = new Map([["AAPL", { qty: 100, avgEntry: 300 }]]);
    const usage = await readCapUsage(stubSupabase(rows), "u1", DEFAULT_GUIDED_CAPS, 100_000, open, NOW);
    expect(usage.deployedPct).toBeCloseTo(30, 6);
    expect(usage.blockedReason).toContain("cap");
  });
});
