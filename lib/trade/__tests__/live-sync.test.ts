import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const readLiveAlpacaConnection = vi.fn();
const getPositions = vi.fn();
const manageProtocolExits = vi.fn();
const reconcilePositions = vi.fn();
const settlePendingTradeLogs = vi.fn();

vi.mock("@/lib/brokers/live-creds", () => ({
  readLiveAlpacaConnection: (...args: unknown[]) => readLiveAlpacaConnection(...args),
}));
vi.mock("@/lib/brokers/alpaca", () => ({
  getPositions: (...args: unknown[]) => getPositions(...args),
}));
vi.mock("@/lib/trade/exit-manager", () => ({
  manageProtocolExits: (...args: unknown[]) => manageProtocolExits(...args),
}));
vi.mock("@/lib/portfolio/reconcile", () => ({
  reconcilePositions: (...args: unknown[]) => reconcilePositions(...args),
}));
vi.mock("@/lib/portfolio/trade-log-settle", () => ({
  settlePendingTradeLogs: (...args: unknown[]) => settlePendingTradeLogs(...args),
}));

import { syncLiveAccount } from "@/lib/trade/live-sync";

const supabase = {} as SupabaseClient;
const creds = { key: "k", secret: "s", mode: "live" as const };

describe("syncLiveAccount", () => {
  beforeEach(() => {
    readLiveAlpacaConnection.mockReset();
    getPositions.mockReset();
    manageProtocolExits.mockReset();
    reconcilePositions.mockReset();
    settlePendingTradeLogs.mockReset();
  });

  it("is a no-op when there is no live connection", async () => {
    readLiveAlpacaConnection.mockResolvedValue(null);
    const result = await syncLiveAccount(supabase, "u1");
    expect(result).toEqual({ connected: false, exits: null, reconcile: null, settlement: null, error: null });
    expect(getPositions).not.toHaveBeenCalled();
  });

  it("fetches live positions once and feeds all three sync passes", async () => {
    readLiveAlpacaConnection.mockResolvedValue({ connectionId: "c1", creds });
    getPositions.mockResolvedValue([
      { symbol: "AAPL", qty: "10", side: "long", avg_entry_price: "200" },
    ]);
    manageProtocolExits.mockResolvedValue({ managed: 1, attached: 0, adjusted: 0, closed: 0, notes: [], error: null });
    reconcilePositions.mockResolvedValue({ opened: 1, closed: 0, error: null });
    settlePendingTradeLogs.mockResolvedValue({ settled: 0, stillPending: 0, error: null });

    const result = await syncLiveAccount(supabase, "u1");

    expect(manageProtocolExits).toHaveBeenCalledWith(supabase, creds, "u1", [
      { symbol: "AAPL", qty: "10", side: "long", avg_entry_price: "200" },
    ]);
    expect(reconcilePositions).toHaveBeenCalledWith(supabase, creds, "u1", [
      { symbol: "AAPL", qty: 10, side: "long", avgEntry: 200 },
    ]);
    expect(settlePendingTradeLogs).toHaveBeenCalledWith(supabase, creds, "u1");
    expect(result.connected).toBe(true);
    expect(result.exits?.managed).toBe(1);
    expect(result.reconcile?.opened).toBe(1);
    expect(result.error).toBeNull();
  });

  it("normalizes a short position's quantity to a positive count", async () => {
    readLiveAlpacaConnection.mockResolvedValue({ connectionId: "c1", creds });
    getPositions.mockResolvedValue([{ symbol: "TSLA", qty: "-5", side: "short", avg_entry_price: "250" }]);
    manageProtocolExits.mockResolvedValue({ managed: 0, attached: 0, adjusted: 0, closed: 0, notes: [], error: null });
    reconcilePositions.mockResolvedValue({ opened: 0, closed: 0, error: null });
    settlePendingTradeLogs.mockResolvedValue({ settled: 0, stillPending: 0, error: null });

    await syncLiveAccount(supabase, "u1");

    expect(reconcilePositions).toHaveBeenCalledWith(supabase, creds, "u1", [
      { symbol: "TSLA", qty: 5, side: "short", avgEntry: 250 },
    ]);
  });

  it("reports an error and skips the three passes when the broker's position list can't be read", async () => {
    readLiveAlpacaConnection.mockResolvedValue({ connectionId: "c1", creds });
    getPositions.mockRejectedValue(new Error("Alpaca down"));

    const result = await syncLiveAccount(supabase, "u1");

    expect(result.connected).toBe(true);
    expect(result.error).toContain("Alpaca down");
    expect(manageProtocolExits).not.toHaveBeenCalled();
    expect(reconcilePositions).not.toHaveBeenCalled();
    expect(settlePendingTradeLogs).not.toHaveBeenCalled();
  });
});
