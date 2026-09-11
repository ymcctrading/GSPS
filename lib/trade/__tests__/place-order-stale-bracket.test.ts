/**
 * Regression test for the 2026-09-01 through 2026-09-08 production incident:
 * four bracket orders (AMD, TSLA, DRAM, BAC) filled far enough from their
 * planned entry that the take-profit target ended up on the wrong side of the
 * real fill, and all four filled with `exit_plan_id` left null — unprotected,
 * indistinguishable in the UI from a normal open position.
 *
 * `checkBracket` already validated stop/target against a base price — but
 * only the price known *before* the fill (the submitted limit, or an
 * automation plan's stale `referencePrice`). Nothing re-checked it against
 * the price the order actually filled at, which for an advised entry (fills
 * at wherever the market crossed the trigger) or a "now" market order (fills
 * at whatever the live quote is) can be a long way from that first check.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const quotePrice = vi.fn();
const isTriggered = vi.fn();
const executeFill = vi.fn();
const getOpenPosition = vi.fn();
const killSwitchRefusal = vi.fn(() => null);
const recordOrderExecution = vi.fn();

vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    assetClassOf: () => "us_equity",
    quotePrice: (...args: unknown[]) => quotePrice(...args),
    quoteOptionPrice: vi.fn(),
    isTriggered: (...args: unknown[]) => isTriggered(...args),
    executeFill: (...args: unknown[]) => executeFill(...args),
    getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
    logPlainClose: vi.fn(),
  };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => killSwitchRefusal() };
});
vi.mock("@/lib/learning/record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/record")>("@/lib/learning/record");
  return { ...actual, recordOrderExecution: (...args: unknown[]) => recordOrderExecution(...args) };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

function stubSupabase() {
  const ordersInsert = vi.fn();
  const protocolExitsInsert = vi.fn();
  const tables: Record<string, unknown> = {
    orders: {
      insert: (row: unknown) => {
        ordersInsert(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "order-1" }, error: null }) }) };
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    },
    protocol_exits: {
      insert: (row: unknown) => {
        protocolExitsInsert(row);
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "plan-1" }, error: null }) }) };
      },
    },
  };
  return { supabase: { from: (t: string) => tables[t] } as unknown as SupabaseClient, ordersInsert, protocolExitsInsert };
}

// AMD, 2026-09-01: plan priced entry 459.48 / stop 456.37 / target 464.15 as a
// "now" automation-style entry with no submitted limit price, so it fills as
// a plain market order — real market had already run to 476.08 by the time it
// executed, past both the entry and its own take-profit target.
const amdIncident: OrderInput = {
  symbol: "AMD",
  assetClass: "equity",
  side: "buy",
  qty: 3,
  mode: "paper",
  entryMode: "now",
  referencePrice: 459.48,
  attachLevels: { stopLoss: 456.37, takeProfit: 464.15, masterProfit: 471.6 },
  intradaySourced: false,
};

describe("placeSimulatedOrder — bracket re-validated against the real fill", () => {
  beforeEach(() => {
    quotePrice.mockReset();
    isTriggered.mockReset();
    executeFill.mockReset().mockResolvedValue({ price: 0, qty: 0, positionId: "pos-1", closed: null });
    getOpenPosition.mockReset().mockResolvedValue(null);
    killSwitchRefusal.mockReset().mockReturnValue(null);
    recordOrderExecution.mockReset();
  });

  it("blocks the exact AMD incident: a market fill past its own bracket target", async () => {
    quotePrice.mockResolvedValue(476.08); // the real 2026-09-01 fill
    const { supabase, ordersInsert, protocolExitsInsert } = stubSupabase();

    const result = await placeSimulatedOrder(supabase, "u1", amdIncident);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "fill_outran_bracket" });
    // The whole point: no row anywhere, so a stale fill can never leave a
    // position half-recorded and unprotected the way the incident did.
    expect(ordersInsert).not.toHaveBeenCalled();
    expect(protocolExitsInsert).not.toHaveBeenCalled();
  });

  it("still fills normally when the market has not run past the bracket", async () => {
    quotePrice.mockResolvedValue(460.10); // between entry and target, as intended
    const { supabase, ordersInsert, protocolExitsInsert } = stubSupabase();

    const result = await placeSimulatedOrder(supabase, "u1", amdIncident);

    expect(result.status).toBe(200);
    expect(ordersInsert).toHaveBeenCalledTimes(1);
    expect(protocolExitsInsert).toHaveBeenCalledTimes(1);
  });

  it("blocks an advised (trigger) entry that fills past its own target", async () => {
    // Same shape as the manual-ticket path: a submitted limit acting as a
    // breakout trigger, filled at the market price once crossed — see
    // isTriggered's own doc comment in lib/brokers/simulator.ts.
    quotePrice.mockResolvedValue(476.08);
    isTriggered.mockReturnValue(true);
    const { supabase, ordersInsert } = stubSupabase();

    const result = await placeSimulatedOrder(supabase, "u1", {
      ...amdIncident,
      entryMode: "advised",
      referencePrice: undefined,
      limitPrice: 459.48,
    });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "fill_outran_bracket" });
    expect(ordersInsert).not.toHaveBeenCalled();
  });

  it("does not affect an order with no protocol levels attached", async () => {
    quotePrice.mockResolvedValue(476.08);
    const { supabase, ordersInsert } = stubSupabase();

    const result = await placeSimulatedOrder(supabase, "u1", {
      symbol: "NVDA",
      assetClass: "equity",
      side: "buy",
      qty: 10,
      mode: "paper",
      entryMode: "now",
      intradaySourced: false,
    });

    expect(result.status).toBe(200);
    expect(ordersInsert).toHaveBeenCalledTimes(1);
  });
});
