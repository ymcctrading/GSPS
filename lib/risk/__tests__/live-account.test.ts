import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const listAccounts = vi.fn();
const isSnapTradeEnabled = vi.fn();
const decryptJson = vi.fn();
const getAccount = vi.fn();

vi.mock("@/lib/brokers/snaptrade", () => ({
  listAccounts: (...args: unknown[]) => listAccounts(...args),
  isSnapTradeEnabled: () => isSnapTradeEnabled(),
}));
vi.mock("@/lib/crypto", () => ({
  decryptJson: (...args: unknown[]) => decryptJson(...args),
}));
vi.mock("@/lib/brokers/alpaca", () => ({
  getAccount: (...args: unknown[]) => getAccount(...args),
}));

import { readLiveAccountValue } from "@/lib/risk/live-account";

interface Row {
  provider: string;
  credentials: { enc: string };
}

/**
 * Supports both query shapes `readLiveAccountValue` issues: the single-row
 * lookup `readLiveAlpacaConnection` makes (select→eq→eq→eq→limit→maybeSingle,
 * filtered to `provider = 'alpaca_live', status = 'active'`) and the
 * multi-row fallback it makes itself (select→eq→eq→in).
 */
function stubSupabase(rows: Row[]): SupabaseClient {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    limit: () => builder,
    maybeSingle: () => {
      const match = rows.find((r) => r.provider === filters.provider);
      return Promise.resolve({ data: match ?? null, error: null });
    },
    in: (col: string, vals: string[]) =>
      Promise.resolve({ data: rows.filter((r) => vals.includes(r.provider)), error: null }),
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
    getAccount.mockReset();
  });

  it("reports not connected with no linked accounts", async () => {
    const v = await readLiveAccountValue(stubSupabase([]), "u1");
    expect(v).toEqual({ connected: false, equity: 0, verified: false });
  });

  it("prefers a connected Alpaca live account, reading real equity", async () => {
    decryptJson.mockReturnValue({ key: "k", secret: "s" });
    getAccount.mockResolvedValue({ equity: "12345.67" });
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "alpaca_live", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v).toEqual({ connected: true, equity: 12345.67, verified: true });
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("fails closed (not verified) when the Alpaca live account read throws", async () => {
    decryptJson.mockReturnValue({ key: "k", secret: "s" });
    getAccount.mockRejectedValue(new Error("network error"));
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "alpaca_live", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v).toEqual({ connected: true, equity: 0, verified: false });
  });

  it("falls back to SnapTrade when no Alpaca live connection exists", async () => {
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

  it("fails closed when SnapTrade is not configured", async () => {
    isSnapTradeEnabled.mockReturnValue(false);
    const v = await readLiveAccountValue(
      stubSupabase([{ provider: "snaptrade", credentials: { enc: "x" } }]),
      "u1",
    );
    expect(v.verified).toBe(false);
  });
});
