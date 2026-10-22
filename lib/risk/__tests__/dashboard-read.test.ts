/**
 * readRiskDashboard: what the loader reads and how it joins it (review of
 * #415). The arithmetic is summarizeRiskBook's (dashboard.test.ts); this
 * covers the paper/working filter on the exit plans, the symbol|side join,
 * the throw a failed read becomes, and the Novice mapping from the tier.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  account: { cash: 90_000 },
  open: [] as unknown[],
  working: [] as unknown[] | null,
}));
const tier = vi.hoisted(() => ({ percentRiskCeilings: false, maxCorrelatedRiskGroups: "unlimited" as number | "unlimited" }));

vi.mock("@/lib/brokers/simulator", async (orig) => ({
  ...(await orig<typeof import("@/lib/brokers/simulator")>()),
  getOrCreateAccount: vi.fn(async () => sim.account),
  listOpenPositions: vi.fn(async () => sim.open),
  listWorkingPaperEntries: vi.fn(async () => sim.working),
}));
vi.mock("@/lib/risk/dynamic-risk", async (orig) => ({
  ...(await orig<typeof import("@/lib/risk/dynamic-risk")>()),
  readWinningRun: vi.fn(async () => null),
}));
vi.mock("@/lib/risk/profitPeak", () => ({ readProfitCeiling: vi.fn(async () => null) }));
vi.mock("@/lib/risk/lossSeries", () => ({ readUserLossSeries: vi.fn(async () => ({ consecutiveLosses: 0, paused: false, note: null })) }));
vi.mock("@/lib/entitlements/policy", () => ({ getUserEntitlementPolicy: vi.fn(async () => tier) }));
vi.mock("@/lib/portfolio/paper-equity", async (orig) => ({
  ...(await orig<typeof import("@/lib/portfolio/paper-equity")>()),
  paperDrawdownPct: vi.fn(async () => null),
}));

import { readRiskDashboard } from "@/lib/risk/dashboard";

interface ExitsResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

function client(result: ExitsResult) {
  const filters: [string, unknown][] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    },
    then: (resolve: (r: ExitsResult) => unknown) => resolve(result),
  };
  const supabase = { from: vi.fn(() => chain) };
  return { supabase: supabase as never, filters, from: supabase.from };
}

const exit = (o: Record<string, unknown>) => ({
  symbol: "AAPL", side: "long", entry_price: 100, stop_loss: 97, applied_stop: null,
  scale_out_qty: 100, master_qty: 0, runner_qty: 0, scale_out_order_id: null, master_order_id: null, runner_order_id: null,
  ...o,
});
const position = (o: Record<string, unknown>) => ({
  symbol: "AAPL", side: "long", qty: 100, avg_entry_price: 100, stop_loss: 95, asset_class: "us_equity", ...o,
});

beforeEach(() => {
  sim.open = [];
  sim.working = [];
  tier.percentRiskCeilings = false;
  tier.maxCorrelatedRiskGroups = "unlimited";
});

describe("readRiskDashboard", () => {
  it("reads only the member's working paper exit plans", async () => {
    const c = client({ data: [], error: null });
    await readRiskDashboard(c.supabase, "u1");
    expect(c.from).toHaveBeenCalledWith("protocol_exits");
    expect(c.filters).toEqual([["user_id", "u1"], ["mode", "paper"], ["status", "working"]]);
  });

  it("joins each plan to its position by symbol and side, never across sides", async () => {
    sim.open = [position({}), position({ symbol: "TSLA", side: "short", qty: 10, avg_entry_price: 500, stop_loss: 520 })];
    const c = client({
      data: [
        exit({ symbol: "aapl" }),
        // A long plan on TSLA must not cover the short.
        exit({ symbol: "TSLA", side: "long", entry_price: 500, stop_loss: 490, scale_out_qty: 10 }),
      ],
      error: null,
    });
    const d = await readRiskDashboard(c.supabase, "u1");
    expect(d.positions[0]).toMatchObject({ symbol: "AAPL", riskUsd: 300, unprotectedQty: 0 });
    expect(d.positions[1]).toMatchObject({ symbol: "TSLA", side: "short", riskUsd: null, unprotectedQty: 10 });
  });

  it("throws when the exit plans or the resting orders can't be read, so the route answers 503", async () => {
    await expect(readRiskDashboard(client({ data: null, error: { message: "boom" } }).supabase, "u1")).rejects.toThrow(/exit plans/);
    sim.working = null;
    await expect(readRiskDashboard(client({ data: [], error: null }).supabase, "u1")).rejects.toThrow(/resting orders/);
  });

  it("shows Novice's guard rails only for a tier that has percent ceilings", async () => {
    sim.open = [position({})];
    const c = client({ data: [exit({})], error: null });
    expect((await readRiskDashboard(c.supabase, "u1")).novice).toBeNull();
    tier.percentRiskCeilings = true;
    tier.maxCorrelatedRiskGroups = 1;
    const d = await readRiskDashboard(client({ data: [exit({})], error: null }).supabase, "u1");
    expect(d.novice).toMatchObject({ maxSymbols: 1, symbolsOpen: 1 });
    // The rule-1 tenth stays apart from Novice's room for the next trade.
    expect(d.tenthPerTrade).toBeGreaterThan(d.maxRiskPerTrade);
  });
});
