/**
 * A technique's own levels the person chose to trade (owner, 2026-10-22,
 * lib/strategies/compare.ts) are their own limit: no Gann crossing line is
 * read from the technique's stop. A hand-typed Manual Override stop, with no
 * technique named, still falls back to the crossing line as before.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const readEntryConfirmationNow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/confirmNow", () => ({ readEntryConfirmationNow }));

import { confirmEntry } from "../place-order";

const supabase = {} as SupabaseClient;
const order = {
  symbol: "DRAM",
  assetClass: "equity" as const,
  side: "sell" as const,
  entryMode: "advised" as const,
  limitPrice: 49.1,
  attachLevels: { stopLoss: 51.2, takeProfit: 45.95 },
};

beforeEach(() => {
  readEntryConfirmationNow.mockReset();
  readEntryConfirmationNow.mockResolvedValue({ ready: false, stage: "waiting", note: "Waiting." });
});

describe("confirmEntry and a technique's own levels", () => {
  it("waits for no crossing on a technique's own entry", async () => {
    const result = await confirmEntry(supabase, "u1", { ...order, techniqueSource: "macdMomentum" });
    expect(result).toEqual({ refusal: null, atMarket: false });
    expect(readEntryConfirmationNow).not.toHaveBeenCalled();
  });

  it("still reads the crossing line from a typed stop with no technique named", async () => {
    const result = await confirmEntry(supabase, "u1", order);
    expect(result.refusal?.body).toMatchObject({ code: "awaiting_confirmation" });
    expect(readEntryConfirmationNow).toHaveBeenCalledOnce();
  });

  it("still holds a technique's stop to the risk cap", async () => {
    const result = await confirmEntry(supabase, "u1", {
      ...order,
      techniqueSource: "macdMomentum",
      attachLevels: { stopLoss: 80, takeProfit: 45.95 },
    });
    expect(result.refusal?.body).toMatchObject({ code: "risk_over_five_points" });
  });
});
