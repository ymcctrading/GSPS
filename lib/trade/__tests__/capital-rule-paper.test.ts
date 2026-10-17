/**
 * Q4, Q6 (owner, 2026-10-16, "Switch all nine"): Gann's capital rules on the
 * paper path, the same check the live path makes (place-order-live.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const sim = vi.hoisted(() => ({
  cash: 10_000,
  open: [] as { symbol: string; asset_class: string; qty: number; avg_entry_price: number; stop_loss: number | null }[],
}));
vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    getOpenPosition: async () => null,
    getOrCreateAccount: async () => ({ cash: sim.cash }),
    listOpenPositions: async () => sim.open,
  };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => null };
});
vi.mock("@/lib/risk/lossSeries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/risk/lossSeries")>("@/lib/risk/lossSeries");
  return { ...actual, readUserLossSeries: async () => ({ paused: false }) };
});
// Isolate Gann's rules from the % ceilings.
vi.mock("@/lib/risk/position-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/risk/position-limits")>("@/lib/risk/position-limits");
  return { ...actual, checkPositionLimits: () => ({ ok: true, violations: [] }) };
});

vi.mock("@/lib/entitlements/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements/policy")>("@/lib/entitlements/policy");
  return { ...actual, getUserEntitlementPolicy: async () => ({ maxCorrelatedRiskGroups: "unlimited" }) };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

const base = {
  symbol: "AAPL",
  assetClass: "equity",
  side: "buy",
  qty: 10,
  mode: "paper",
  entryMode: "advised",
  limitPrice: 100,
  referencePrice: 100,
  intradaySourced: false,
  attachLevels: { stopLoss: 95, takeProfit: 110 },
} as unknown as OrderInput;
const place = (i: Partial<OrderInput>) =>
  placeSimulatedOrder({} as SupabaseClient, "u1", { ...base, ...i } as OrderInput).catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
const held = (symbol: string, qty = 1) => ({ symbol, asset_class: "us_equity", qty, avg_entry_price: 100, stop_loss: 95 });

describe("the capital rules on a paper order", () => {
  beforeEach(() => {
    sim.cash = 10_000;
    sim.open = [];
  });

  it("refuses a sixth stock and lets a held one add (A-RISK-08, never-failing rule 8)", async () => {
    sim.open = [held("MSFT"), held("NVDA"), held("XOM"), held("JPM"), held("KO")];
    expect((await place({})).body.code).toBe("max_open_symbols");
    expect((await place({ symbol: "MSFT" })).body.code).not.toBe("max_open_symbols");
  });

  it("refuses more shares than the capital carries, counting shares already held (A-RISK-01)", async () => {
    // Equity 10,000 + 100 held = 10,100; about 49.77 a share at 100.
    sim.cash = 10_000 - 100 * 100;
    sim.open = [held("MSFT", 100)];
    const r = await place({ qty: 150 });
    expect(r.body.code).toBe("capital_per_share");
    expect((await place({ qty: 50 })).body.code).not.toBe("capital_per_share");
  });

  it("leaves an option order to the option rules", async () => {
    sim.open = [held("MSFT"), held("NVDA"), held("XOM"), held("JPM"), held("KO")];
    expect((await place({ assetClass: "option" } as Partial<OrderInput>)).body.code).not.toBe("max_open_symbols");
  });
});
