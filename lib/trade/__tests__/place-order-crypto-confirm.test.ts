/**
 * A crypto entry confirms on crypto bars (review of #454). `confirmEntry`
 * read the crossing line on stock bars whatever the symbol, so a BTC/USD
 * plan order was refused (`confirmation_unavailable`) or waited forever. It
 * now reads the asset class from the symbol, as the quote and fill do.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const readEntryConfirmationNow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/confirmNow", () => ({ readEntryConfirmationNow }));

import { confirmEntry } from "../place-order";

const supabase = {} as SupabaseClient;

beforeEach(() => {
  readEntryConfirmationNow.mockReset();
  readEntryConfirmationNow.mockResolvedValue({ ready: true, stage: "armed", note: "Armed." });
});

describe("confirmEntry reads the symbol's own market", () => {
  it("confirms a crypto entry on crypto bars", async () => {
    const result = await confirmEntry(supabase, "u1", {
      symbol: "BTC/USD",
      assetClass: "equity",
      side: "buy",
      entryMode: "advised",
      limitPrice: 64000,
      entryStop: 63200,
      attachLevels: { stopLoss: 63200, takeProfit: 67000 },
    });
    expect(result.refusal).toBeNull();
    expect(readEntryConfirmationNow).toHaveBeenCalledOnce();
    expect(readEntryConfirmationNow.mock.calls[0][0]).toMatchObject({ symbol: "BTC/USD", assetClass: "crypto" });
  });

  it("confirms a stock or fund entry on stock bars", async () => {
    await confirmEntry(supabase, "u1", {
      symbol: "GLD",
      assetClass: "equity",
      side: "buy",
      entryMode: "advised",
      limitPrice: 240,
      entryStop: 236,
      attachLevels: { stopLoss: 236, takeProfit: 248 },
    });
    expect(readEntryConfirmationNow.mock.calls[0][0]).toMatchObject({ symbol: "GLD", assetClass: "us_equity" });
  });
});
