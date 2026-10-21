/**
 * Review 2026-10-21 (#376): a resting paper entry is checked against Gann's
 * capital rules again when it fills (lib/trade/resting-entry-guard.ts). Two
 * limits resting at the five-stock edge must not both fill.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const prices = vi.hoisted(() => ({ map: {} as Record<string, number> }));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchLatestPrice: async (s: string) => prices.map[s] ?? null }),
}));
vi.mock("@/lib/risk/dynamic-risk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/risk/dynamic-risk")>()),
  readWinningRun: async () => null,
}));
vi.mock("@/lib/risk/profitPeak", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/risk/profitPeak")>()),
  readProfitCeiling: async () => null,
}));
vi.mock("@/lib/notifications/resend-handler", () => ({ sendOrderInvalidatedEmail: vi.fn() }));

import { evaluateRestingOrders } from "@/lib/brokers/simulator";

type Row = Record<string, unknown>;

/** An in-memory stand-in for the tables and RPCs the resting-order pass touches. */
function fakeDb(seed: { orders: Row[]; positions: Row[]; cash: number }) {
  const db: Record<string, Row[]> = {
    orders: seed.orders,
    positions: seed.positions,
    paper_accounts: [{ user_id: "u1", cash: seed.cash }],
    protocol_exits: [],
    trade_logs: [],
  };
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      update: (p: Row) => ((patch = p), q),
      insert: async () => ({ error: null }),
      maybeSingle: async () => {
        const hit = rows()[0] ?? null;
        if (patch && hit) Object.assign(hit, patch);
        return { data: hit, error: null };
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
    });
    return q;
  }
  const rpc = async (name: string, args: Row) => {
    if (name === "increment_paper_cash") {
      (db.paper_accounts[0].cash as number) += args.p_delta as number;
      return { error: null };
    }
    db.positions.push({
      id: `pos-${db.positions.length + 1}`,
      user_id: "u1",
      mode: "paper",
      closed: false,
      symbol: args.p_symbol,
      asset_class: "us_equity",
      side: "long",
      qty: args.p_qty,
      avg_entry_price: args.p_price,
      opened_at: new Date().toISOString(),
    });
    return { data: { positionId: "pos", closed: null }, error: null };
  };
  return { client: { from, rpc } as unknown as SupabaseClient, db };
}

const position = (symbol: string): Row => ({
  id: `held-${symbol}`,
  user_id: "u1",
  mode: "paper",
  closed: false,
  symbol,
  asset_class: "us_equity",
  side: "long",
  qty: 10,
  avg_entry_price: 100,
  opened_at: "2026-10-20T14:00:00Z",
});
const resting = (id: string, symbol: string, qty = 10): Row => ({
  id,
  user_id: "u1",
  mode: "paper",
  status: "new",
  order_type: "bracket",
  symbol,
  side: "buy",
  qty,
  limit_price: 100,
  stop_price: 95,
  asset_class: "us_equity",
  created_at: "2026-10-21T14:00:00Z",
});

describe("evaluateRestingOrders: the capital rules at the fill", () => {
  beforeEach(() => {
    prices.map = { KO: 99, PEP: 99, MSFT: 99 };
  });

  it("fills one of two resting limits at the five-stock edge and cancels the other", async () => {
    const { client, db } = fakeDb({
      orders: [resting("o-ko", "KO"), resting("o-pep", "PEP")],
      positions: [position("MSFT"), position("NVDA"), position("XOM"), position("JPM")],
      cash: 100_000,
    });

    const r = await evaluateRestingOrders(client, "u1");

    expect(r).toMatchObject({ filled: 1, refused: 1, error: null });
    expect(db.orders.find((o) => o.id === "o-ko")?.status).toBe("filled");
    const pep = db.orders.find((o) => o.id === "o-pep");
    expect(pep?.status).toBe("rejected");
    expect(String(pep?.reject_reason)).toContain("at most 5 stocks");
    expect(db.positions.filter((p) => !p.closed)).toHaveLength(5);
  });

  it("cancels a resting entry that would risk more than a tenth of the unit", async () => {
    // Unit 100,000 (the starting capital), so a tenth is 10,000. 1,900 shares
    // fit the capital a share (about 49 at 99, so about 94,000), but filled at
    // 99 with the stop at 93 they risk 11,400.
    const order = { ...resting("o-big", "MSFT", 1_900), stop_price: 93 };
    const { client, db } = fakeDb({ orders: [order], positions: [], cash: 100_000 });

    const r = await evaluateRestingOrders(client, "u1");

    expect(r).toMatchObject({ filled: 0, refused: 1 });
    expect(db.orders[0].status).toBe("rejected");
    expect(db.positions).toHaveLength(0);
  });

  it("never refuses a resting order that only reduces a position", async () => {
    prices.map = { MSFT: 101 };
    const sell: Row = { ...resting("o-sell", "MSFT"), side: "sell", stop_price: null };
    const { client, db } = fakeDb({
      orders: [sell],
      positions: [position("MSFT"), position("NVDA"), position("XOM"), position("JPM"), position("KO")],
      cash: 0,
    });

    const r = await evaluateRestingOrders(client, "u1");

    expect(r.refused).toBe(0);
    expect(db.orders[0].status).toBe("filled");
  });
});
