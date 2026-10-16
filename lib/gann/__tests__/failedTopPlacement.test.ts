/**
 * A-LEVELS-04 at placement (review 12 M1): the failed-top check reads the
 * protocol's first target, never a target typed in Manual Override, and treats
 * a missing one as unknown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const readEntryConfirmationNow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/confirmNow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/confirmNow")>("@/lib/lifecycle/confirmNow");
  return { ...actual, readEntryConfirmationNow };
});
const getTradePlan = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/store")>("@/lib/lifecycle/store");
  return { ...actual, getTradePlan };
});

import { entryConfirmationRefusal, OrderSchema, type OrderInput } from "@/lib/trade/place-order";

const supabase = { from: () => ({}) } as unknown as SupabaseClient;
const target = () => readEntryConfirmationNow.mock.calls.at(-1)![0].takeProfit1;

describe("placement reads the protocol's first target for the failed-top check", () => {
  beforeEach(() => {
    readEntryConfirmationNow.mockReset().mockResolvedValue({ ready: true, stage: "confirmed", note: "" });
    getTradePlan.mockReset();
  });

  it("takes the protocol target the ticket sends, not the Manual Override one it attaches", async () => {
    const order = OrderSchema.parse({
      symbol: "AAPL", side: "buy", qty: 1, entryMode: "advised", limitPrice: 101, entryStop: 97, entryTarget: 118,
      attachLevels: { stopLoss: 97, takeProfit: 105 },
    }) as OrderInput;
    await entryConfirmationRefusal(supabase, "u1", order);
    expect(target()).toBe(118);
  });

  it("passes no target when the ticket sends none, even with levels attached", async () => {
    const order = OrderSchema.parse({
      symbol: "AAPL", side: "buy", qty: 1, entryMode: "advised", limitPrice: 101, entryStop: 97,
      attachLevels: { stopLoss: 97, takeProfit: 105 },
    }) as OrderInput;
    await entryConfirmationRefusal(supabase, "u1", order);
    expect(target()).toBeUndefined();
  });

  it("takes a stored plan's own first target", async () => {
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "sig-1", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryKind: "crossing", entryTrigger: 101, invalidation: 97, takeProfit1: 116 },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 101, attachLevels: { stopLoss: 97, takeProfit: 104 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000003",
    };
    await entryConfirmationRefusal(supabase, "u1", order);
    expect(target()).toBe(116);
  });
});
