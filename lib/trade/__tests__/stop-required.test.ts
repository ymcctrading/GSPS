/**
 * Q1 (owner, 2026-10-16): every new equity position carries a stop, manual
 * ticket orders included (A-STOP-01: "a stop on every trade"). An order that
 * reduces or closes a position needs none.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getOpenPosition = vi.fn();
vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return { ...actual, getOpenPosition: (...args: unknown[]) => getOpenPosition(...args) };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => null };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

const base = { symbol: "AAPL", assetClass: "equity", side: "buy", qty: 10, entryMode: "now", intradaySourced: false } as unknown as OrderInput;
const supabase = {} as SupabaseClient;

describe("a new position needs a stop (A-STOP-01)", () => {
  it("refuses an opening equity order with no stop, paper and live", async () => {
    getOpenPosition.mockResolvedValue(null);
    for (const mode of ["paper", "live"] as const) {
      const r = await placeSimulatedOrder(supabase, "u1", { ...base, mode } as OrderInput);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe("stop_required");
    }
  });

  it("lets an order that closes a long through without one", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10 });
    const r = await placeSimulatedOrder(supabase, "u1", { ...base, side: "sell", mode: "paper" } as OrderInput).catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
    expect(r.body.code).not.toBe("stop_required");
  });
});
