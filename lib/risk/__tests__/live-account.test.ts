import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const listAccounts = vi.fn();
const isSnapTradeEnabled = vi.fn();
const decryptJson = vi.fn();

vi.mock("@/lib/brokers/snaptrade", () => ({
  listAccounts: (...args: unknown[]) => listAccounts(...args),
  isSnapTradeEnabled: () => isSnapTradeEnabled(),
}));
vi.mock("@/lib/crypto", () => ({
  decryptJson: (...args: unknown[]) => decryptJson(...args),
}));

import { readLiveAccountValue } from "@/lib/risk/live-account";

function stubSupabase(rows: { provider: string; credentials: { enc: string } }[]): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("readLiveAccountValue", () => {
  beforeEach(() => {
    listAccounts.mockReset();
    isSnapTradeEnabled.mockReset();
    isSnapTradeEnabled.mockReturnValue(true);
    decryptJson.mockReset();
    decryptJson.mockReturnValue({ userSecret: "secret" });
  });

  it("reports not connected with no linked accounts", async () => {
    const v = await readLiveAccountValue(stubSupabase([]), "u1");
    expect(v).toEqual({ connected: false, equity: 0, verified: false });
  });

  it("sums verified equity across every linked SnapTrade account", async () => {
    listAccounts.mockResolvedValue([
      { balance: { total: { amount: 1000 } } },
      { balance: { total: { amount: 250 } } },
    ]);
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "snaptrade", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v).toEqual({ connected: true, equity: 1250, verified: true });
  });

  it("fails closed (not verified) when a SnapTrade read throws", async () => {
    listAccounts.mockRejectedValue(new Error("network error"));
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "snaptrade", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v).toEqual({ connected: true, equity: 0, verified: false });
  });

  it("fails closed when only an alpaca_live connection exists (no reader yet)", async () => {
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "alpaca_live", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v).toEqual({ connected: true, equity: 0, verified: false });
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("fails closed when SnapTrade is not configured", async () => {
    isSnapTradeEnabled.mockReturnValue(false);
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "snaptrade", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v.verified).toBe(false);
  });
});
