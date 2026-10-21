/**
 * The sweep read only the 200 oldest closed trades, so once those were
 * critiqued every later trade went without one.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: async () => ({ content: [{ type: "text", text: "A plain recap." }] }) };
  },
}));

function fake(tradeCount: number, critiquedCount: number) {
  const trades = Array.from({ length: tradeCount }, (_, i) => ({
    id: `t${String(i).padStart(4, "0")}`,
    symbol: "AAPL", direction: "buy", quantity: 1, entry_price: 100, entry_timestamp: "2026-10-01T14:00:00Z",
    exit_price: 101, exit_timestamp: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    outcome: "profit", profit_loss_dollars: 1, profit_loss_percent: 1, exit_condition: "manual",
    signal_called: "manual order", signal_adherence: null,
  }));
  const critiqued = new Set(trades.slice(0, critiquedCount).map((t) => t.id));
  const inserted: string[] = [];
  const supabase = {
    from(table: string) {
      let range: [number, number] = [0, tradeCount];
      let ids: string[] = [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order"]) q[m] = () => q;
      q.range = (a: number, b: number) => { range = [a, b]; return q; };
      q.in = (_c: string, v: string[]) => { ids = v; return q; };
      q.insert = async (row: { trade_log_id: string }) => { inserted.push(row.trade_log_id); return { error: null }; };
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          table === "trade_logs"
            ? { data: trades.slice(range[0], range[1] + 1), error: null }
            : { data: ids.filter((id) => critiqued.has(id)).map((trade_log_id) => ({ trade_log_id })), error: null },
        );
      return q;
    },
  } as unknown as SupabaseClient;
  return { supabase, inserted };
}

describe("generateMissingCritiques", () => {
  it("finds trades past the first page once the oldest are critiqued", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const { generateMissingCritiques } = await import("@/lib/demo/critique");
    const { supabase, inserted } = fake(450, 200);
    const out = await generateMissingCritiques(supabase, "demo");
    expect(out.generated).toBe(5);
    expect(inserted).toEqual(["t0200", "t0201", "t0202", "t0203", "t0204"]);
  });
});
