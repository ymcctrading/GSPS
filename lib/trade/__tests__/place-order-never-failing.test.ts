/**
 * Never-failing rules 1 and 9 on the paper placement path.
 *
 * Rule 1 (W006 p.46; Commodities pp.29-30 and rule 1, pp.43-45): never risk
 * more than a tenth of the capital on a trade, read on the trading unit.
 * Rule 9 (Commodities rule 9, pp.43-45 and p.19; W021 PDF p.124): never limit
 * orders or fix a price; trade at the market. Once the protocol's entry has
 * confirmed (a closed bar traded into the buying zone), it is a market order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const quotePrice = vi.fn();
const isTriggered = vi.fn();
const executeFill = vi.fn();
const getOpenPosition = vi.fn();

vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    assetClassOf: () => "us_equity",
    quotePrice: (...args: unknown[]) => quotePrice(...args),
    quoteOptionPrice: vi.fn(),
    isTriggered: (...args: unknown[]) => isTriggered(...args),
    executeFill: (...args: unknown[]) => executeFill(...args),
    getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
    listWorkingPaperEntries: async () => [],
    logPlainClose: vi.fn(),
  };
});
vi.mock("@/lib/lifecycle/confirmNow", () => ({
  readEntryConfirmationNow: vi.fn(async () => ({ ready: true, stage: "confirmed", note: "confirmed" })),
}));
vi.mock("@/lib/learning/record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/record")>("@/lib/learning/record");
  return { ...actual, recordOrderExecution: vi.fn() };
});
vi.mock("@/lib/entitlements/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements/policy")>("@/lib/entitlements/policy");
  return { ...actual, getUserEntitlementPolicy: vi.fn(async () => actual.getEntitlementPolicy("SYSTEM_MASTERY")) };
});
// Isolate the tenth from the account's percent ceilings.
vi.mock("@/lib/risk/position-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/risk/position-limits")>("@/lib/risk/position-limits");
  return { ...actual, checkPositionLimits: () => ({ ok: true, violations: [] }) };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

function rowsOf(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in", "not", "order", "limit"]) q[k] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
  return q;
}

function stubSupabase(cash = 100_000, closes: { profit_loss_dollars: number }[] = [], prefs: unknown = null, open: unknown[] = []) {
  const ordersInsert = vi.fn();
  const tables: Record<string, unknown> = {
    orders: {
      insert: (row: unknown) => {
        ordersInsert(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "order-1" }, error: null }) }) };
      },
      update: () => ({ eq: function eq(): unknown { return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) }; } }),
    },
    protocol_exits: {
      insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "plan-1" }, error: null }) }) }),
    },
    paper_accounts: {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { cash }, error: null }) }) }),
    },
    positions: {
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: open, error: null }) }) }) }) }),
    },
    trade_logs: rowsOf(closes),
    settings: { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: prefs ? { prefs } : null, error: null }) }) }) },
  };
  return { supabase: { from: (t: string) => tables[t] } as unknown as SupabaseClient, ordersInsert };
}

const now: OrderInput = {
  symbol: "AAPL",
  assetClass: "equity",
  side: "buy",
  qty: 100,
  mode: "paper",
  entryMode: "now",
  referencePrice: 100,
  attachLevels: { stopLoss: 92, takeProfit: 120 },
  intradaySourced: false,
};

beforeEach(() => {
  quotePrice.mockReset().mockResolvedValue(100);
  isTriggered.mockReset().mockReturnValue(false);
  executeFill.mockReset().mockResolvedValue({ price: 100, qty: 0, positionId: "pos-1", closed: null });
  getOpenPosition.mockReset().mockResolvedValue(null);
});

describe("rule 1 on paper: a tenth of the trading capital", () => {
  it("refuses an entry risking more than a tenth, and places nothing", async () => {
    // $8 a share × 1,300 = $10,400, over a tenth of the $100,000 unit.
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_300 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "risk_one_tenth" });
    expect(String(r.body.error)).toMatch(/1250/);
    expect(ordersInsert).not.toHaveBeenCalled();
  });

  it("places an entry risking exactly a tenth", async () => {
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_250 });
    expect(r.status).toBe(200);
    expect(ordersInsert).toHaveBeenCalledTimes(1);
  });

  it("reads the trading unit, not equity above it", async () => {
    // $150,000 of cash: the unit stays at the $100,000 starting capital until
    // profits equal it, so the tenth is still $10,000.
    const { supabase } = stubSupabase(150_000);
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_300 });
    expect(r.body).toMatchObject({ code: "risk_one_tenth" });
  });

  it("after a loss from large profits, refuses more than a tenth of the profits left (A-RISK-07)", async () => {
    // 100,000 grew to 200,000, then lost 10,000: 9,000 may be risked, not 10,000.
    const { supabase, ordersInsert } = stubSupabase(190_000, [{ profit_loss_dollars: 100_000 }, { profit_loss_dollars: -10_000 }]);
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_200 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "risk_tenth_of_profits" });
    expect(ordersInsert).not.toHaveBeenCalled();
    const ok = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_125 });
    expect(ok.status).toBe(200);
  });

  it("brings the close-out reminder back with a new entry inside the away window (A-EXIT-05)", async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { supabase } = stubSupabase(100_000, [], { gannRules: { awayFrom: soon } });
    const r = await placeSimulatedOrder(supabase, "u1", now);
    expect(r.status).toBe(200);
    expect(String(r.body.warning)).toMatch(/away from the market/);
    const later = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const { supabase: s2 } = stubSupabase(100_000, [], { gannRules: { awayFrom: later } });
    expect((await placeSimulatedOrder(s2, "u1", now)).body.warning ?? null).toBeNull();
  });

  it("never blocks an order that closes a position", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 5_000, symbol: "AAPL" });
    const { supabase } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, side: "sell", qty: 5_000, attachLevels: undefined });
    expect(r.body.code).not.toBe("risk_one_tenth");
    expect(r.status).toBe(200);
  });
});

describe("rule 13 on paper: never average a loss (A-PYRAMID-03/04)", () => {
  const held = [{ id: "p1", symbol: "AAPL", asset_class: "equity", side: "long", qty: 10, avg_entry_price: 104, opened_at: "2026-10-20T14:00:00Z", stop_loss: 98, take_profit: null, master_profit: null, scan_result_id: null }];
  it("refuses a buy that adds to a long showing a loss, and places nothing", async () => {
    const { supabase, ordersInsert } = stubSupabase(100_000, [], null, held);
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 10 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "average_a_loss" });
    expect(ordersInsert).not.toHaveBeenCalled();
  });
  it("lets the add through once the long shows a profit", async () => {
    const { supabase } = stubSupabase(100_000, [], null, [{ ...held[0], avg_entry_price: 96 }]);
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 10 });
    expect(r.body.code).not.toBe("average_a_loss");
  });
});

describe("rule 9 on paper: the protocol's entry goes at the market", () => {
  const advised: OrderInput = {
    ...now,
    qty: 10,
    entryMode: "advised",
    referencePrice: undefined,
    limitPrice: 100,
    entryStop: 95,
    attachLevels: { stopLoss: 95, takeProfit: 120 },
  };

  it("fills a confirmed protocol entry at the market quote, with no limit price", async () => {
    quotePrice.mockResolvedValue(100.4);
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", advised);
    expect(r.status).toBe(200);
    expect(isTriggered).not.toHaveBeenCalled();
    const row = ordersInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe("filled");
    expect(row.filled_avg_price).toBe(100.4);
    expect(row.limit_price).toBeNull();
    // The plan's price is kept on the row so the fill can be measured against it.
    expect(row.requested_limit_price).toBe(100);
  });

  it("leaves a person's own limit order, with no protocol stop sent, as a limit", async () => {
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...advised, entryStop: undefined });
    expect(r.status).toBe(200);
    const row = ordersInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe("new");
    expect(row.limit_price).toBe(100);
  });
});

describe("the ceilings read the server's price (review finding F-01)", () => {
  it("measures a market order's risk at the live quote, not the ticket's price", async () => {
    // The ticket says 93 (risk $1 a share); the quote is 100 (risk $8).
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, qty: 1_300, referencePrice: 93 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "risk_one_tenth" });
    expect(ordersInsert).not.toHaveBeenCalled();
  });

  it("refuses a market order when no price can be read, rather than skipping the ceilings", async () => {
    quotePrice.mockResolvedValue(null);
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...now, referencePrice: undefined });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "no_reference_price" });
    expect(ordersInsert).not.toHaveBeenCalled();
  });
});

describe("rule 1 on a bought option: the premium is the risk (review finding F-04)", () => {
  const option: OrderInput = {
    symbol: "AAPL261120C00200000",
    assetClass: "option",
    side: "buy",
    qty: 20,
    mode: "paper",
    entryMode: "now",
    intradaySourced: false,
    optionDetail: { strike: 200, type: "call", expiration: "2026-11-20", premium: 6 },
  };

  it("refuses premium over a tenth of the trading unit", async () => {
    // 20 contracts × $6 × 100 = $12,000, over the $10,000 tenth.
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", option);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "risk_one_tenth" });
    expect(String(r.body.error)).toMatch(/16 AAPL/);
    expect(ordersInsert).not.toHaveBeenCalled();
  });

  it("places premium within the tenth", async () => {
    const { supabase, ordersInsert } = stubSupabase();
    const r = await placeSimulatedOrder(supabase, "u1", { ...option, qty: 16 });
    expect(r.status).toBe(200);
    expect(ordersInsert).toHaveBeenCalledTimes(1);
  });
});
