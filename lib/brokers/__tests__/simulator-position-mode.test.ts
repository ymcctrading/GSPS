/**
 * Regression coverage for the mode-filtering fix to
 * getOpenPosition/listOpenPositions/listLiveOpenPositions — before this fix,
 * neither paper-reading function filtered by `positions.mode`, so a user
 * who also held a live position would have had it silently swept into every
 * paper read (portfolio equity, the paper "Close position" route, etc.).
 * See lib/brokers/simulator.ts's header comment on these three functions.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenPosition, listOpenPositions, listLiveOpenPositions } from "@/lib/brokers/simulator";

interface FakeRow {
  id: string;
  user_id: string;
  mode: "paper" | "live";
  symbol: string;
  closed: boolean;
  side: string;
  qty: number;
  avg_entry_price: number;
  opened_at: string;
  asset_class: string;
  stop_loss: number | null;
  take_profit: number | null;
  master_profit: number | null;
  scan_result_id: string | null;
}

function fakeClient(rows: FakeRow[]) {
  function builder() {
    const applied: Partial<Record<string, unknown>> = {};
    const api = {
      eq: vi.fn((col: string, val: unknown) => {
        applied[col] = val;
        return api;
      }),
      order: vi.fn(() => api),
      limit: vi.fn(() => api),
      select: vi.fn(() => api),
      then: undefined as undefined,
      maybeSingle: vi.fn(async () => {
        const matches = rows.filter((r) =>
          Object.entries(applied).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
        );
        return { data: matches[0] ?? null, error: null };
      }),
      // listOpenPositions/listLiveOpenPositions await the query builder
      // directly rather than calling a terminal method — resolve it like a
      // thenable, matching the real supabase-js client's shape.
      async resolveList() {
        const matches = rows.filter((r) =>
          Object.entries(applied).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
        );
        return { data: matches, error: null };
      },
    };
    // The real client is awaitable directly (PostgrestFilterBuilder
    // implements PromiseLike) — mirror that for the list-shaped calls.
    (api as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve(api.resolveList());
    return api;
  }

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => builder()),
    })),
  } as unknown as SupabaseClient;
}

describe("simulator position-mode filtering", () => {
  const paperRow: FakeRow = {
    id: "p1",
    user_id: "u1",
    mode: "paper",
    symbol: "AAPL",
    closed: false,
    side: "long",
    qty: 10,
    avg_entry_price: 100,
    opened_at: "2026-09-01T00:00:00.000Z",
    asset_class: "us_equity",
    stop_loss: null,
    take_profit: null,
    master_profit: null,
    scan_result_id: null,
  };
  const liveRow: FakeRow = { ...paperRow, id: "l1", mode: "live", symbol: "MSFT" };

  it("listOpenPositions never returns a live-mode row", async () => {
    const client = fakeClient([paperRow, liveRow]);
    const result = await listOpenPositions(client, "u1");
    expect(result.map((r) => r.symbol)).toEqual(["AAPL"]);
  });

  it("listLiveOpenPositions never returns a paper-mode row", async () => {
    const client = fakeClient([paperRow, liveRow]);
    const result = await listLiveOpenPositions(client, "u1");
    expect(result.map((r) => r.symbol)).toEqual(["MSFT"]);
  });

  it("getOpenPosition on a live-mode symbol returns null under the paper reader", async () => {
    const client = fakeClient([liveRow]);
    const result = await getOpenPosition(client, "u1", "MSFT");
    expect(result).toBeNull();
  });
});
