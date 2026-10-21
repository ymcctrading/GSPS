/**
 * Review finding R-008: an exit edit never loosens the stop the exit manager
 * has already trailed to (`applied_stop`), and editing a target alone leaves
 * that stop where the rules put it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getOpenPosition = vi.fn();
const quotePrice = vi.fn();

vi.mock("@/lib/brokers/simulator", () => ({
  getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
  quotePrice: (...args: unknown[]) => quotePrice(...args),
  assetClassOf: vi.fn(() => "us_equity"),
  isOption: vi.fn(() => false),
}));

import { updateProtocolExit } from "@/lib/trade/attach-protocol-exit";

const position = {
  id: "pos-1", symbol: "AAPL", asset_class: "us_equity", side: "long" as const, qty: 10,
  avg_entry_price: 200, opened_at: "2026-09-01T00:00:00.000Z",
  stop_loss: 190, take_profit: 220, master_profit: null, scan_result_id: null,
};
const plan = { id: "plan-1", stop_loss: 190, applied_stop: 205, take_profit_1: 220, master_profit: null, qty: 10 };

function stub() {
  const update = vi.fn();
  const chain = (): unknown => ({ eq: chain, limit: () => ({ maybeSingle: () => Promise.resolve({ data: plan }) }) });
  const tables: Record<string, unknown> = {
    protocol_exits: {
      select: () => chain(),
      update: (row: unknown) => { update(row); return { eq: function eq(): unknown { return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) }; } }; },
    },
    positions: { update: () => ({ eq: function eq(): unknown { return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) }; } }) },
  };
  return { supabase: { from: (t: string) => tables[t] } as unknown as SupabaseClient, update };
}

beforeEach(() => {
  getOpenPosition.mockReset().mockResolvedValue(position);
  quotePrice.mockReset().mockResolvedValue(212);
});

describe("updateProtocolExit and the trailed stop (R-008)", () => {
  it("refuses a stop below the trailed stop, even if above the plan's first stop", async () => {
    const { supabase, update } = stub();
    const r = await updateProtocolExit(supabase, "u1", { symbol: "AAPL", stopLoss: 200 });
    expect(r.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("moves the stop in force when the new stop tightens it", async () => {
    const { supabase, update } = stub();
    const r = await updateProtocolExit(supabase, "u1", { symbol: "AAPL", stopLoss: 207 });
    expect(r.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ applied_stop: 207, applied_stop_reason: "manual" });
  });

  it("leaves the trailed stop alone when only a target is edited", async () => {
    const { supabase, update } = stub();
    const r = await updateProtocolExit(supabase, "u1", { symbol: "AAPL", takeProfit1: 225 });
    expect(r.status).toBe(200);
    const row = update.mock.calls[0][0] as Record<string, unknown>;
    expect("applied_stop" in row).toBe(false);
    expect("applied_stop_reason" in row).toBe(false);
  });
});
