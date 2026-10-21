/**
 * Q4, Q6 (owner, 2026-10-16, "Switch all nine"): Gann's capital rules on the
 * paper path, the same check the live path makes (place-order-live.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const sim = vi.hoisted(() => ({
  cash: 10_000,
  open: [] as { symbol: string; asset_class: string; qty: number; avg_entry_price: number; stop_loss: number | null }[],
  working: [] as { id: string; symbol: string; side: "buy" | "sell"; qty: number; price: number; stop: number | null }[],
}));
vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    getOpenPosition: async () => null,
    getOrCreateAccount: async () => ({ cash: sim.cash }),
    listOpenPositions: async () => sim.open,
    listWorkingPaperEntries: async () => sim.working,
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
    sim.working = [];
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

  it("counts resting entries in the book: two resting limits can't open a sixth stock (review 2026-10-21)", async () => {
    // Four stocks held and one limit resting in a fifth: a second resting
    // limit in a sixth name is refused at placement, as it would be once the
    // first had filled.
    sim.open = [held("MSFT"), held("NVDA"), held("XOM"), held("JPM")];
    sim.working = [{ id: "o1", symbol: "KO", side: "buy", qty: 1, price: 60, stop: 57 }];
    expect((await place({ symbol: "PEP" })).body.code).toBe("max_open_symbols");
    // Adding to the name already resting is not a new stock.
    expect((await place({ symbol: "KO" })).body.code).not.toBe("max_open_symbols");
    // Without the resting order the fifth stock is room left.
    sim.working = [];
    expect((await place({ symbol: "PEP" })).body.code).not.toBe("max_open_symbols");
  });

  it("counts resting entries' shares against the capital a share (A-RISK-01)", async () => {
    // Equity 10,000, nothing held, about 49.77 of capital a share at 100: 150
    // shares resting take about 7,465 of it, so 90 more is too many and 40 fits.
    sim.working = [{ id: "o1", symbol: "MSFT", side: "buy", qty: 150, price: 100, stop: 95 }];
    expect((await place({ qty: 90 })).body.code).toBe("capital_per_share");
    expect((await place({ qty: 40 })).body.code).not.toBe("capital_per_share");
  });

  it("leaves an option order to the option rules", async () => {
    sim.open = [held("MSFT"), held("NVDA"), held("XOM"), held("JPM"), held("KO")];
    expect((await place({ assetClass: "option" } as Partial<OrderInput>)).body.code).not.toBe("max_open_symbols");
  });
});
