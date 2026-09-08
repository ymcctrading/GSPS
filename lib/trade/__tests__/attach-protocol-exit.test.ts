import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getOpenPosition = vi.fn();
const quotePrice = vi.fn();

vi.mock("@/lib/brokers/simulator", () => ({
  getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
  quotePrice: (...args: unknown[]) => quotePrice(...args),
  assetClassOf: vi.fn(() => "us_equity"),
  isOption: vi.fn((symbol: string) => /^[A-Z]+\d{6}[CP]\d{8}$/.test(symbol)),
}));

import { attachProtocolExit } from "@/lib/trade/attach-protocol-exit";

const longPosition = {
  id: "pos-1",
  symbol: "AAPL",
  asset_class: "us_equity",
  side: "long" as const,
  qty: 10,
  avg_entry_price: 200,
  opened_at: "2026-09-01T00:00:00.000Z",
  stop_loss: null,
  take_profit: null,
  master_profit: null,
  scan_result_id: null,
};

function stubSupabase(opts: { existingPlan?: unknown } = {}) {
  const protocolExitsInsert = { data: { id: "plan-1" }, error: null };
  const tables: Record<string, unknown> = {
    protocol_exits: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: opts.existingPlan ?? null }),
                }),
              }),
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve(protocolExitsInsert) }),
      }),
    },
    positions: {
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    },
  };
  return { from: (t: string) => tables[t] } as unknown as SupabaseClient;
}

describe("attachProtocolExit", () => {
  beforeEach(() => {
    getOpenPosition.mockReset();
    quotePrice.mockReset();
  });

  it("refuses an option symbol — no staged-exit plan for options", async () => {
    const result = await attachProtocolExit(stubSupabase(), "u1", {
      symbol: "AAPL260918C00220000",
      stopLoss: 190,
      takeProfit: 220,
    });
    expect(result.status).toBe(422);
    expect(getOpenPosition).not.toHaveBeenCalled();
  });

  it("refuses when there is no open position in the symbol", async () => {
    getOpenPosition.mockResolvedValue(null);
    const result = await attachProtocolExit(stubSupabase(), "u1", {
      symbol: "AAPL",
      stopLoss: 190,
      takeProfit: 220,
    });
    expect(result.status).toBe(404);
  });

  it("refuses when a working plan already exists for the symbol", async () => {
    getOpenPosition.mockResolvedValue(longPosition);
    const result = await attachProtocolExit(stubSupabase({ existingPlan: { id: "existing" } }), "u1", {
      symbol: "AAPL",
      stopLoss: 190,
      takeProfit: 220,
    });
    expect(result.status).toBe(409);
  });

  it("refuses a stop on the wrong side of the market for a long", async () => {
    getOpenPosition.mockResolvedValue(longPosition);
    quotePrice.mockResolvedValue(205);
    const result = await attachProtocolExit(stubSupabase(), "u1", {
      symbol: "AAPL",
      stopLoss: 210, // above market — wrong side for a long
      takeProfit: 220,
    });
    expect(result.status).toBe(422);
  });

  it("attaches a valid stop/target to an open long and mirrors it onto positions", async () => {
    getOpenPosition.mockResolvedValue(longPosition);
    quotePrice.mockResolvedValue(205);
    const result = await attachProtocolExit(stubSupabase(), "u1", {
      symbol: "AAPL",
      stopLoss: 195,
      takeProfit: 215,
    });
    expect(result.status).toBe(200);
    expect((result.body as { planId: string }).planId).toBe("plan-1");
  });

  it("supports a short position, with sides mirrored", async () => {
    getOpenPosition.mockResolvedValue({ ...longPosition, side: "short" as const });
    quotePrice.mockResolvedValue(205);
    const result = await attachProtocolExit(stubSupabase(), "u1", {
      symbol: "AAPL",
      stopLoss: 215, // above market — correct side for a short
      takeProfit: 195,
    });
    expect(result.status).toBe(200);
  });
});
