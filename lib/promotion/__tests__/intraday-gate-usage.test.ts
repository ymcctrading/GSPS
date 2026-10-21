/**
 * The Pro intraday loss pause lasts "for the rest of the session". A streak
 * counted across days never ended: a paused trader can't take the winner that
 * would end it, so three losses yesterday blocked every intraday entry until
 * the orders aged out of the lookback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countLossStreak, loadProIntradayUsage } from "@/lib/promotion/intraday-gate-usage";

function fake(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("countLossStreak", () => {
  it("counts losses back to the first winner", () => {
    expect(countLossStreak([{ outcome: "loss" }, { outcome: "loss" }, { outcome: "profit" }, { outcome: "loss" }])).toBe(2);
  });
});

describe("loadProIntradayUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T15:00:00Z")); // 11:00 ET, Wednesday
  });
  afterEach(() => vi.useRealTimers());

  it("does not carry yesterday's losing streak or losses into today", async () => {
    const yesterday = "2026-10-20T18:00:00Z";
    const supabase = fake({
      paper_accounts: [{ cash: 100_000 }],
      positions: [],
      orders: [
        { id: "o1", symbol: "AAPL", status: "filled", created_at: yesterday },
        { id: "o2", symbol: "MSFT", status: "filled", created_at: yesterday },
        { id: "o3", symbol: "NVDA", status: "filled", created_at: yesterday },
      ],
      trade_logs: [
        { order_id: "o3", outcome: "loss", profit_loss_dollars: -900, exit_timestamp: "2026-10-20T19:30:00Z" },
        { order_id: "o2", outcome: "loss", profit_loss_dollars: -900, exit_timestamp: "2026-10-20T19:00:00Z" },
        { order_id: "o1", outcome: "loss", profit_loss_dollars: -900, exit_timestamp: "2026-10-20T18:30:00Z" },
      ],
    });
    const usage = await loadProIntradayUsage(supabase, "u1");
    expect(usage.consecutiveLosses).toBe(0);
    expect(usage.dailyLossPct).toBe(0);
    expect(usage.entriesToday).toBe(0);
  });

  it("counts today's streak", async () => {
    const supabase = fake({
      paper_accounts: [{ cash: 100_000 }],
      positions: [],
      orders: [{ id: "o1", symbol: "AAPL", status: "filled", created_at: "2026-10-21T14:00:00Z" }],
      trade_logs: [
        { order_id: "o1", outcome: "loss", profit_loss_dollars: -500, exit_timestamp: "2026-10-21T14:50:00Z" },
        { order_id: "o1", outcome: "loss", profit_loss_dollars: -500, exit_timestamp: "2026-10-21T14:40:00Z" },
        { order_id: "o0", outcome: "loss", profit_loss_dollars: -500, exit_timestamp: "2026-10-20T19:40:00Z" },
      ],
    });
    const usage = await loadProIntradayUsage(supabase, "u1");
    expect(usage.consecutiveLosses).toBe(2);
    expect(usage.dailyLossPct).toBeCloseTo(1, 5);
  });
});
