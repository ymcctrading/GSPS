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

function stub(row: Record<string, unknown> = plan) {
  const update = vi.fn();
  const chain = (): unknown => ({ eq: chain, limit: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) });
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

describe("updateProtocolExit after TP1 was reached (2026-11-12, NEE)", () => {
  // NEE: 4 shares at 77.36, TP1 78.53 sold 2 on Oct 12, best 89.99, now ~86.
  const nee = {
    id: "plan-nee", stop_loss: 76.86, applied_stop: 78.87, take_profit_1: 78.53, master_profit: null, qty: 4,
    high_water: 89.99, scale_out_qty: 2, master_qty: 0, runner_qty: 2,
    scale_out_order_id: "sim_1", master_order_id: null, runner_order_id: null,
  };
  beforeEach(() => {
    getOpenPosition.mockResolvedValue({ ...position, symbol: "NEE", qty: 2, avg_entry_price: 77.36, stop_loss: 76.86, take_profit: 78.53 });
    quotePrice.mockResolvedValue(86.37);
  });

  it("saves an MTP added once the price is past TP1 (it was refused as a bracket target)", async () => {
    const { supabase, update } = stub(nee);
    const r = await updateProtocolExit(supabase, "u1", { symbol: "NEE", masterProfit: 92 });
    expect(r.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ master_profit: 92, take_profit_1: 78.53 });
  });

  it("keeps the split once a tranche has sold, so the shares already sold are not sold again", async () => {
    const { supabase, update } = stub(nee);
    await updateProtocolExit(supabase, "u1", { symbol: "NEE", masterProfit: 92 });
    const row = update.mock.calls[0][0] as Record<string, unknown>;
    expect("scale_out_qty" in row).toBe(false);
    expect("runner_qty" in row).toBe(false);
    expect("master_qty" in row).toBe(false);
  });

  it("refuses an MTP at or behind the current price", async () => {
    const { supabase, update } = stub(nee);
    const r = await updateProtocolExit(supabase, "u1", { symbol: "NEE", masterProfit: 85 });
    expect(r.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("still refuses a stop at or above the current price", async () => {
    const { supabase, update } = stub(nee);
    const r = await updateProtocolExit(supabase, "u1", { symbol: "NEE", stopLoss: 87 });
    expect(r.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("moves the stop up under the price past TP1", async () => {
    const { supabase, update } = stub(nee);
    const r = await updateProtocolExit(supabase, "u1", { symbol: "NEE", stopLoss: 84 });
    expect(r.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ applied_stop: 84, applied_stop_reason: "manual" });
  });
});

describe("updateProtocolExit — a TP1 sale still to come", () => {
  it("refuses a TP1 moved behind the price while its sale has not filled", async () => {
    getOpenPosition.mockResolvedValue(position);
    quotePrice.mockResolvedValue(212);
    const pending = { ...plan, high_water: 214, scale_out_qty: 6, master_qty: 0, runner_qty: 4, scale_out_order_id: null, master_order_id: null, runner_order_id: null, take_profit_1: 213 };
    const { supabase, update } = stub(pending);
    const r = await updateProtocolExit(supabase, "u1", { symbol: "AAPL", takeProfit1: 210 });
    expect(r.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });
});
